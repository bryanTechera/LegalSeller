import "server-only";

import { pedirSintesis } from "@/lib/agent-service";
import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { construirTimeline } from "@/lib/revision/timeline";
import { logger } from "@/utils/logger";

import { calcularHuella } from "./huella";
import { sintesisSchema, type Sintesis } from "./sintesis-schema";

/**
 * Espejos de `backend/src/mastra/sintesis/prompt.ts` y `config/modelos.ts`.
 * Los dos entran en la huella, y por eso se replican en vez de leerse del
 * backend: la huella tiene que poder calcularse sin llamar a nadie, que es
 * justamente lo que la hace barata. Cambiarlos allá sin cambiarlos acá deja
 * vigentes síntesis generadas con el prompt o el modelo viejo.
 */
const PROMPT_VERSION = "3";
const MODELO = "google/gemini-3.5-flash-lite";

export type EstadoSintesis =
  | { estado: "ok"; sintesis: Sintesis; generadaEn: string; vigente: boolean }
  | { estado: "sin-sintesis" }
  | { estado: "error"; sintesis: Sintesis | null; generadaEn: string | null };

/**
 * Punto de entrada único de la síntesis, idempotente. Devuelve la guardada si
 * el material no cambió; si cambió (o con `forzar`), la regenera y persiste.
 *
 * Se lo llama desde tres lados —el turno que capta el caso, la vista, y el
 * botón de regenerar— y los tres pasan por acá para que exista un solo lugar
 * donde se decide qué es "estar al día".
 */
export async function asegurarSintesis(
  casoId: string,
  opciones?: { forzar?: boolean },
): Promise<EstadoSintesis> {
  const caso = await prisma.caso.findFirst({
    where: { id: casoId, ...casosReales(null) },
    select: {
      id: true,
      categoria: true,
      subcategorias: true,
      resumen: true,
      contactoNombre: true,
      contactoTelefono: true,
      contactoEmail: true,
      estado: true,
      conversation: { select: { threadId: true } },
      sintesis: { select: { contenido: true, huella: true, modelo: true, generadaEn: true } },
    },
  });
  if (!caso) return { estado: "sin-sintesis" };

  const guardada = leerGuardada(caso.sintesis);

  const timeline = await construirTimeline(caso.conversation.threadId);
  const mensajes = timeline.filter((item) => item.tipo === "mensaje");
  // Sin transcript no hay nada que resumir: llamar al modelo con una
  // conversación vacía solo puede producir una síntesis inventada.
  if (mensajes.length === 0) {
    return guardada
      ? { estado: "ok", sintesis: guardada.contenido, generadaEn: guardada.generadaEn, vigente: false }
      : { estado: "sin-sintesis" };
  }

  const huella = calcularHuella({
    promptVersion: PROMPT_VERSION,
    modelo: MODELO,
    mensajes: {
      cantidad: mensajes.length,
      ultimoId: mensajes[mensajes.length - 1]?.id ?? null,
      ultimaFecha: mensajes[mensajes.length - 1]?.fecha ?? null,
    },
    caso: {
      categoria: caso.categoria,
      subcategorias: caso.subcategorias,
      resumen: caso.resumen,
      contactoNombre: caso.contactoNombre,
      contactoTelefono: caso.contactoTelefono,
      contactoEmail: caso.contactoEmail,
      estado: caso.estado,
    },
  });

  if (guardada && guardada.huella === huella && opciones?.forzar !== true) {
    return { estado: "ok", sintesis: guardada.contenido, generadaEn: guardada.generadaEn, vigente: true };
  }

  const resultado = await pedirSintesis({
    caso: {
      categoria: caso.categoria,
      subcategorias: caso.subcategorias,
      estado: caso.estado,
      resumen: textoDelResumen(caso.resumen),
    },
    mensajes: mensajes.map((mensaje) => ({ rol: mensaje.rol, texto: mensaje.texto })),
  });

  if (resultado.status === "error") {
    // Lo viejo, marcado como desactualizado, es mejor que nada.
    return {
      estado: "error",
      sintesis: guardada?.contenido ?? null,
      generadaEn: guardada?.generadaEn ?? null,
    };
  }

  const generadaEn = new Date();
  await prisma.sintesisCaso.upsert({
    where: { casoId },
    create: { casoId, contenido: resultado.sintesis, huella, modelo: resultado.modelo, generadaEn },
    update: { contenido: resultado.sintesis, huella, modelo: resultado.modelo, generadaEn },
  });

  return { estado: "ok", sintesis: resultado.sintesis, generadaEn: generadaEn.toISOString(), vigente: true };
}

/** El Json de Postgres no está tipado: si no valida, es como no tener síntesis. */
function leerGuardada(
  fila: { contenido: unknown; huella: string; modelo: string; generadaEn: Date } | null,
): { contenido: Sintesis; huella: string; generadaEn: string } | null {
  if (!fila) return null;
  const validado = sintesisSchema.safeParse(fila.contenido);
  if (!validado.success) {
    logger.warn("síntesis guardada con forma inválida, se regenera", {
      campos: validado.error.issues.map((issue) => issue.path.join(".")),
    });
    return null;
  }
  return { contenido: validado.data, huella: fila.huella, generadaEn: fila.generadaEn.toISOString() };
}

/** `Caso.resumen` es `{ brief?, hechos?, temaDetectado? }` — se aplana a texto. */
function textoDelResumen(resumen: unknown): string | null {
  if (typeof resumen === "string") return resumen;
  if (resumen === null || typeof resumen !== "object") return null;
  const campos = resumen as Record<string, unknown>;
  const partes = ["brief", "temaDetectado", "hechos"]
    .map((clave) => campos[clave])
    .filter((valor): valor is string => typeof valor === "string" && valor.trim() !== "");
  return partes.length === 0 ? null : partes.join("\n");
}
