import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { threadIdForSession } from "./session";

const ESCAPES = new Set(["fuera-de-universo", "categoria-no-habilitada"]);

/** El Caso que atiende el turno: resolución del puntero Conversation.casoActivoId. */
export interface CasoActivo {
  id: string;
  categoria: string | null;
  estado: "EN_CONVERSACION" | "CAPTADO" | "FUERA_DE_COBERTURA";
  origen: "DOMINIO" | "FUERA_DE_COBERTURA";
  correccionAplicada: boolean;
}

const SELECT_CASO_ACTIVO = {
  id: true,
  categoria: true,
  estado: true,
  origen: true,
  correccionAplicada: true,
} as const;

/**
 * Contacto heredable entre casos de la MISMA conversación (spec §2): el Caso N
 * nace CAPTADO con los datos que el consultante ya dio, porque volver a pedirle
 * el teléfono a quien acaba de darlo destruye la confianza que sostiene el
 * funnel. Toma el CAPTADO más reciente, no el primero: si corrigió su teléfono
 * en el caso 2, el caso 3 hereda el corregido.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function contactoHeredable(
  tx: Prisma.TransactionClient,
  conversationId: string,
): Promise<{ contactoNombre: string | null; contactoTelefono: string | null; contactoEmail: string | null } | null> {
  return tx.caso.findFirst({
    where: { conversationId, estado: "CAPTADO" },
    orderBy: { updatedAt: "desc" },
    select: { contactoNombre: true, contactoTelefono: true, contactoEmail: true },
  });
}

/**
 * Duck-typed check for Prisma's unique-constraint violation (P2002). Deliberately
 * NOT `error instanceof Prisma.PrismaClientKnownRequestError` — that class can't
 * be constructed (or cheaply mocked) in unit tests, whereas a plain
 * `{ code: "P2002" }` shape is both what Prisma's real error exposes and what a
 * test double can produce directly.
 */
function esErrorDeUnicidad(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "P2002";
}

export async function getOrCreateConversation(
  sessionId: string,
): Promise<{ id: string; categoria: string | null; casoActivoId: string | null }> {
  return prisma.conversation.upsert({
    where: { sessionId },
    create: { sessionId, threadId: threadIdForSession(sessionId) },
    update: {},
    select: { id: true, categoria: true, casoActivoId: true },
  });
}

/**
 * El Caso que atiende el turno. Resuelve el puntero `Conversation.casoActivoId`
 * a la fila real, con auto-reparación: si el puntero quedó colgado adopta el
 * Caso más reciente de la conversación y lo reescribe, en vez de mandar el
 * turno al receptor y abrir un caso duplicado sobre la misma categoría.
 * Devuelve null SOLO cuando la conversación todavía no tiene ningún Caso: ese
 * es el único disparador legítimo del receptor inaugural.
 */
export async function resolverCasoActivo(sessionId: string): Promise<CasoActivo | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { sessionId },
    select: { id: true, casoActivoId: true },
  });
  if (!conversation) return null;

  if (conversation.casoActivoId) {
    const caso = await prisma.caso.findUnique({
      where: { id: conversation.casoActivoId },
      select: SELECT_CASO_ACTIVO,
    });
    if (caso) return caso;
  }

  const ultimo = await prisma.caso.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { updatedAt: "desc" },
    select: SELECT_CASO_ACTIVO,
  });
  if (!ultimo) return null;
  await prisma.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: ultimo.id } });
  return ultimo;
}

/**
 * Persists the receptor's classification. Idempotent, first-write-wins: a
 * concurrent double-submit or a re-emitted event never overwrites (spec §6).
 * Escapes never become routing state — they only mark the caso as demand
 * signal. A later REAL classification (after an earlier escape) promotes that
 * caso out of FUERA_DE_COBERTURA instead of leaving it frozen. El puntero
 * `casoActivoId` se actualiza en todo camino que resuelve un caso (escape
 * incluido), para que un turno posterior lo encuentre vía `casoActivo` en vez
 * de depender de la auto-reparación de `resolverCasoActivo`.
 */
export async function asignarClasificacion(params: {
  sessionId: string;
  categoria: string;
  subcategoria?: string;
  brief?: string;
  casoSensible?: boolean;
  temaDetectado?: string;
}): Promise<{
  categoria: string | null;
  aplicada: boolean;
  casoId: string | null;
  casoEstado: "EN_CONVERSACION" | "CAPTADO" | "FUERA_DE_COBERTURA" | null;
}> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, casoActivoId: true },
    });
    if (!conversation) return { categoria: null, aplicada: false, casoId: null, casoEstado: null };

    // Nota: `estado` se agrega al select del brief (que solo trae categoria/
    // origen/subcategorias/resumen) porque este mismo objeto también resuelve
    // el early-return de first-write-wins, que necesita devolver casoEstado.
    const casoActivo = conversation.casoActivoId
      ? await tx.caso.findUnique({
          where: { id: conversation.casoActivoId },
          select: { id: true, categoria: true, origen: true, subcategorias: true, resumen: true, estado: true },
        })
      : null;

    if (conversation.categoria) {
      return {
        categoria: conversation.categoria,
        aplicada: false,
        casoId: casoActivo?.id ?? null,
        casoEstado: casoActivo?.estado ?? null,
      };
    }

    const esEscape = ESCAPES.has(params.categoria);
    // El caso activo puede ser el que dejó congelado un escape previo
    // (categoria null, origen FUERA_DE_COBERTURA). Un escape nuevo lo REUSA
    // (nadie afirmó que el tema sea distinto — puede ser la misma consulta
    // reformulada) en vez de abrir otro; una clasificación real lo PROMUEVE
    // fuera del estado congelado. `abrirCasoFueraDeCobertura` (Task 4) es la
    // única vía que crea siempre, porque ahí el agente marcó explícitamente
    // un tema nuevo con derivar-tema.
    const casoActivoEscapado =
      casoActivo?.categoria === null && casoActivo.origen === "FUERA_DE_COBERTURA" ? casoActivo : null;
    let casoExistente = esEscape
      ? casoActivoEscapado
      : ((await tx.caso.findUnique({
          where: { conversationId_categoria: { conversationId: conversation.id, categoria: params.categoria } },
          select: { id: true, categoria: true, origen: true, subcategorias: true, resumen: true },
        })) ?? casoActivoEscapado);

    let caso: { id: string } | undefined;
    if (!casoExistente) {
      try {
        caso = await tx.caso.create({
          data: {
            conversationId: conversation.id,
            categoria: esEscape ? null : params.categoria,
            subcategorias: params.subcategoria ? [params.subcategoria] : [],
            resumen: params.brief ? { brief: params.brief } : undefined,
            estado: esEscape ? "FUERA_DE_COBERTURA" : "EN_CONVERSACION",
            origen: esEscape ? "FUERA_DE_COBERTURA" : "DOMINIO",
          },
          select: { id: true },
        });
      } catch (error) {
        if (!esErrorDeUnicidad(error)) throw error;
        // Concurrent inaugural creation: another transaction won the race on
        // [conversationId, categoria] (@unique) and this insert hit P2002.
        // Recover the winner's caso by the same compound key and fall
        // through to the normal existing-caso flow below (escape no-op /
        // real-classification promote) instead of letting the transaction
        // blow up.
        casoExistente = await tx.caso.findUnique({
          where: { conversationId_categoria: { conversationId: conversation.id, categoria: params.categoria } },
          select: { id: true, categoria: true, origen: true, subcategorias: true, resumen: true },
        });
        if (!casoExistente) throw error;
      }
    }

    if (!caso) {
      if (!casoExistente) {
        // Unreachable: caso is only still undefined here if the create above
        // threw something other than P2002 (already rethrown) or the P2002
        // recovery re-read found nothing (already rethrown too).
        throw new Error("clasificacion: no se pudo resolver el caso");
      }
      if (esEscape) {
        // Escapes never mutate an existing caso — demand signal only.
        caso = casoExistente;
      } else {
        // Promote (Critical fix): the caso may have been created earlier by an
        // escape (categoria: null, estado/origen FUERA_DE_COBERTURA) — a real
        // classification must lift it out of that frozen state. Dedup
        // subcategorias (Set union, like registrarDatosCaso) and merge brief
        // into resumen without clobbering other keys already there.
        const subcategoriasExistentes = casoExistente.subcategorias;
        const subcategorias =
          params.subcategoria && !subcategoriasExistentes.includes(params.subcategoria)
            ? [...subcategoriasExistentes, params.subcategoria]
            : undefined;
        const resumenExistente = (casoExistente.resumen as Record<string, unknown> | null) ?? {};
        caso = await tx.caso.update({
          where: { id: casoExistente.id },
          data: {
            categoria: params.categoria,
            estado: "EN_CONVERSACION",
            origen: "DOMINIO",
            ...(subcategorias ? { subcategorias } : {}),
            ...(params.brief ? { resumen: { ...resumenExistente, brief: params.brief } } : {}),
          },
          select: { id: true },
        });
      }
    }

    await tx.casoEvento.create({
      data: {
        casoId: caso.id,
        tipo: "CLASIFICACION",
        payload: {
          categoria: params.categoria,
          subcategoria: params.subcategoria ?? null,
          casoSensible: params.casoSensible ?? false,
          temaDetectado: params.temaDetectado ?? null,
        },
      },
    });

    // El caso recién resuelto (creado, promovido o reutilizado por un
    // escape) pasa a ser el activo de la conversación — salvo que ya lo
    // fuera (un escape repetido reutiliza el mismo caso congelado y el
    // puntero no se mueve).
    if (casoActivo?.id !== caso.id) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: caso.id } });
    }
    const casoFinal = await tx.caso.findUnique({ where: { id: caso.id }, select: { estado: true } });

    if (esEscape) {
      return { categoria: null, aplicada: false, casoId: caso.id, casoEstado: casoFinal?.estado ?? null };
    }

    // Guarded write: double-submit safe even if two transactions read
    // categoria=null concurrently — only one row with categoria still null
    // gets updated (spec §6 idempotent upsert).
    const updated = await tx.conversation.updateMany({
      where: { id: conversation.id, categoria: null },
      data: { categoria: params.categoria, clasificadaEn: new Date() },
    });
    if (updated.count === 0) {
      // Someone else won the race — re-read instead of returning the stale
      // pre-transaction value (Important fix).
      const actual = await tx.conversation.findUnique({
        where: { id: conversation.id },
        select: { categoria: true },
      });
      return {
        categoria: actual?.categoria ?? null,
        aplicada: false,
        casoId: caso.id,
        casoEstado: casoFinal?.estado ?? null,
      };
    }
    return { categoria: params.categoria, aplicada: true, casoId: caso.id, casoEstado: casoFinal?.estado ?? null };
  });
}

/**
 * Incremental lead capture: merges data as it appears. Escribe siempre sobre el
 * CASO ACTIVO. Sin caso activo (registrar-caso del receptor para captación
 * fuera de cobertura, antes de que exista clasificación) abre el caso de la
 * categoría persistida y deja el puntero apuntándolo.
 */
export async function registrarDatosCaso(params: {
  sessionId: string;
  subcategorias?: string[];
  hechos?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, casoActivoId: true },
    });
    if (!conversation) return;

    const casoActivo = conversation.casoActivoId
      ? await tx.caso.findUnique({
          where: { id: conversation.casoActivoId },
          select: { id: true, subcategorias: true, resumen: true },
        })
      : null;

    // Sin caso activo: upsert por la clave compuesta cuando hay categoría
    // persistida (dos registrar-caso concurrentes de la misma categoría no
    // duplican). Con categoria null NO se puede usar la clave compuesta
    // —Prisma la tipa `categoria: string`— así que va create directo, sin
    // guard: dos registrar-caso concurrentes SIN categoría todavía pueden
    // crear dos Caso con categoria: null para la misma conversación, y es a
    // propósito (spec §3) — cada demanda fuera de cobertura es una señal de
    // mercado separada, y el índice único no los unifica porque Postgres no
    // considera dos NULL iguales. `abrirCasoFueraDeCobertura` (Task 4) va a
    // crear una fila nueva en cada derivación por el mismo motivo.
    let caso: { id: string; subcategorias: string[]; resumen: unknown };
    if (casoActivo) {
      caso = casoActivo;
    } else if (conversation.categoria) {
      caso = await tx.caso.upsert({
        where: {
          conversationId_categoria: { conversationId: conversation.id, categoria: conversation.categoria },
        },
        create: { conversationId: conversation.id, categoria: conversation.categoria },
        update: {},
        select: { id: true, subcategorias: true, resumen: true },
      });
    } else {
      caso = await tx.caso.create({
        data: { conversationId: conversation.id, categoria: null },
        select: { id: true, subcategorias: true, resumen: true },
      });
    }

    if (!casoActivo) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: caso.id } });
    }

    const subcategorias = params.subcategorias
      ? Array.from(new Set([...caso.subcategorias, ...params.subcategorias]))
      : undefined;
    const resumenPrevio = (caso.resumen as Record<string, unknown> | null) ?? {};
    const hechosPrevios = typeof resumenPrevio.hechos === "string" ? `${resumenPrevio.hechos}\n` : "";

    const tieneContacto = Boolean(params.contactoNombre || params.contactoTelefono || params.contactoEmail);
    await tx.caso.update({
      where: { id: caso.id },
      data: {
        ...(subcategorias ? { subcategorias } : {}),
        resumen: {
          ...resumenPrevio,
          ...(params.hechos ? { hechos: `${hechosPrevios}${params.hechos}` } : {}),
        },
        ...(params.contactoNombre ? { contactoNombre: params.contactoNombre } : {}),
        ...(params.contactoTelefono ? { contactoTelefono: params.contactoTelefono } : {}),
        ...(params.contactoEmail ? { contactoEmail: params.contactoEmail } : {}),
        ...(tieneContacto ? { estado: "CAPTADO" } : {}),
      },
    });
    await tx.casoEvento.create({
      data: {
        casoId: caso.id,
        tipo: tieneContacto ? "CONTACTO" : "REGISTRO_DATO",
        payload: JSON.parse(JSON.stringify(params)) as object,
      },
    });
  });
}

/**
 * Bounded reclassification: a lo sumo UNA corrección por CASO, atómica vía el
 * guard `correccionAplicada` sobre `Caso`. Corrige el caso ACTIVO: abrir un tema
 * nuevo es `derivar-tema`, no una corrección. El `CasoEvento` es auditoría, no
 * el guard.
 */
export async function corregirClasificacion(params: {
  sessionId: string;
  categoria: string;
  motivo: string;
}): Promise<{ aplicada: boolean }> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, casoActivoId: true },
    });
    if (!conversation?.casoActivoId) return { aplicada: false };

    const caso = await tx.caso.findUnique({
      where: { id: conversation.casoActivoId },
      select: { id: true, categoria: true },
    });
    if (!caso) return { aplicada: false };

    // Si la categoría destino YA tiene caso en esta conversación, corregir
    // violaría @@unique([conversationId, categoria]) y abortaría la transacción
    // entera con P2002. Eso no es una corrección: es un tema ya abierto, y el
    // camino correcto es derivar-tema.
    const colision = await tx.caso.findUnique({
      where: { conversationId_categoria: { conversationId: conversation.id, categoria: params.categoria } },
      select: { id: true },
    });
    if (colision) return { aplicada: false };

    let updated: { count: number };
    try {
      updated = await tx.caso.updateMany({
        where: { id: caso.id, correccionAplicada: false },
        data: { correccionAplicada: true, categoria: params.categoria },
      });
    } catch (error) {
      if (!esErrorDeUnicidad(error)) throw error;
      // TOCTOU: entre el chequeo de colisión y este update, otra transacción
      // creó el Caso de la categoría destino — el update pisaría
      // @@unique([conversationId, categoria]). Igual que la colisión
      // detectada arriba, no es una corrección aplicable: no reintentes.
      return { aplicada: false };
    }
    if (updated.count === 0) return { aplicada: false };

    await tx.casoEvento.create({
      data: {
        casoId: caso.id,
        tipo: "CORRECCION",
        payload: { de: caso.categoria, a: params.categoria, motivo: params.motivo },
      },
    });
    // La denormalización de la conversación sigue al caso activo.
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { categoria: params.categoria, clasificadaEn: new Date() },
    });
    return { aplicada: true };
  });
}
