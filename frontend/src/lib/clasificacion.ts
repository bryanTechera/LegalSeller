import "server-only";

import { prisma } from "./prisma";
import { threadIdForSession } from "./session";

const ESCAPES = new Set(["fuera-de-universo", "categoria-no-habilitada"]);

export async function getOrCreateConversation(sessionId: string): Promise<{ id: string; categoria: string | null }> {
  const conversation = await prisma.conversation.upsert({
    where: { sessionId },
    create: { sessionId, threadId: threadIdForSession(sessionId) },
    update: {},
    select: { id: true, categoria: true },
  });
  return conversation;
}

/**
 * Persists the receptor's classification. Idempotent, first-write-wins: a
 * concurrent double-submit or a re-emitted event never overwrites (spec §6).
 * Escapes never become routing state — they only mark the caso as demand
 * signal. A later REAL classification (after an earlier escape) promotes that
 * caso out of FUERA_DE_COBERTURA instead of leaving it frozen.
 */
export async function asignarClasificacion(params: {
  sessionId: string;
  categoria: string;
  subcategoria?: string;
  brief?: string;
  casoSensible?: boolean;
  temaDetectado?: string;
}): Promise<{ categoria: string | null; aplicada: boolean }> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true },
    });
    if (!conversation) return { categoria: null, aplicada: false };
    if (conversation.categoria) return { categoria: conversation.categoria, aplicada: false };

    const esEscape = ESCAPES.has(params.categoria);
    const casoExistente = await tx.caso.findUnique({
      where: { conversationId: conversation.id },
      select: { id: true, subcategorias: true, resumen: true },
    });

    let caso: { id: string };
    if (!casoExistente) {
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
    } else if (esEscape) {
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

    if (esEscape) return { categoria: null, aplicada: false };

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
      return { categoria: actual?.categoria ?? null, aplicada: false };
    }
    return { categoria: params.categoria, aplicada: true };
  });
}

/** Incremental lead capture: merges data as it appears (spec §4). */
export async function registrarDatosCaso(params: {
  sessionId: string;
  subcategorias?: string[];
  hechos?: string;
  interesAdicional?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, caso: { select: { id: true, subcategorias: true, resumen: true } } },
    });
    if (!conversation) return;

    const caso =
      conversation.caso ??
      (await tx.caso.create({
        data: { conversationId: conversation.id, categoria: conversation.categoria },
        select: { id: true, subcategorias: true, resumen: true },
      }));

    const subcategorias = params.subcategorias
      ? Array.from(new Set([...caso.subcategorias, ...params.subcategorias]))
      : undefined;
    const resumenPrevio = (caso.resumen as Record<string, unknown> | null) ?? {};
    const hechosPrevios = typeof resumenPrevio.hechos === "string" ? `${resumenPrevio.hechos}\n` : "";
    const interesesPrevios = typeof resumenPrevio.intereses === "string" ? `${resumenPrevio.intereses}\n` : "";

    const tieneContacto = Boolean(params.contactoNombre || params.contactoTelefono || params.contactoEmail);
    await tx.caso.update({
      where: { id: caso.id },
      data: {
        ...(subcategorias ? { subcategorias } : {}),
        resumen: {
          ...resumenPrevio,
          ...(params.hechos ? { hechos: `${hechosPrevios}${params.hechos}` } : {}),
          ...(params.interesAdicional ? { intereses: `${interesesPrevios}${params.interesAdicional}` } : {}),
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
 * Bounded reclassification: at most ONE correction per conversation, enforced
 * atomically via the `correccionAplicada` guard on `Conversation` — a guarded
 * `updateMany` flips it false→true, so two concurrent calls can never both
 * succeed (spec §6). The `CasoEvento` row created on success is the audit
 * record, not the guard.
 */
export async function corregirClasificacion(params: {
  sessionId: string;
  categoria: string;
  motivo: string;
}): Promise<{ aplicada: boolean }> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, caso: { select: { id: true } } },
    });
    if (!conversation?.caso) return { aplicada: false };

    // Guarded write: atomic max-1 correction — only one transaction can flip
    // correccionAplicada false→true for this conversation.
    const updated = await tx.conversation.updateMany({
      where: { id: conversation.id, correccionAplicada: false },
      data: { correccionAplicada: true, categoria: params.categoria, clasificadaEn: new Date() },
    });
    if (updated.count === 0) return { aplicada: false };

    await tx.casoEvento.create({
      data: {
        casoId: conversation.caso.id,
        tipo: "CORRECCION",
        payload: { de: conversation.categoria, a: params.categoria, motivo: params.motivo },
      },
    });
    await tx.caso.update({ where: { id: conversation.caso.id }, data: { categoria: params.categoria } });
    return { aplicada: true };
  });
}
