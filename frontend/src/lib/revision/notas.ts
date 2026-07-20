import "server-only";

import { prisma } from "../prisma";

export interface RespuestaDeNota {
  id: string;
  origen: "EXPERTO" | "DEV";
  autor: string;
  texto: string;
  createdAt: string;
}

export interface NotaConRespuestas {
  id: string;
  messageId: string | null;
  citaTexto: string | null;
  autor: string;
  texto: string;
  estado: "ABIERTA" | "RESPONDIDA" | "RESUELTA";
  createdAt: string;
  respuestas: RespuestaDeNota[];
}

export async function listarNotasDeSesion(conversationId: string): Promise<NotaConRespuestas[]> {
  const notas = await prisma.notaRevision.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { respuestas: { orderBy: { createdAt: "asc" } } },
  });
  return notas.map((nota) => ({
    id: nota.id,
    messageId: nota.messageId,
    citaTexto: nota.citaTexto,
    autor: nota.autor,
    texto: nota.texto,
    estado: nota.estado,
    createdAt: nota.createdAt.toISOString(),
    respuestas: nota.respuestas.map((respuesta) => ({
      id: respuesta.id,
      origen: respuesta.origen,
      autor: respuesta.autor,
      texto: respuesta.texto,
      createdAt: respuesta.createdAt.toISOString(),
    })),
  }));
}

/**
 * Estado inicial por origen (spec §4): una nota de experto queda pendiente
 * del equipo dev (ABIERTA); una nota creada por el dev (pedido de aclaración)
 * queda pendiente del experto (RESPONDIDA).
 */
export async function crearNota(params: {
  conversationId: string;
  origen: "EXPERTO" | "DEV";
  autor: string;
  texto: string;
  messageId?: string;
  citaTexto?: string;
}): Promise<{ id: string }> {
  return prisma.notaRevision.create({
    data: {
      conversationId: params.conversationId,
      autor: params.autor,
      texto: params.texto,
      messageId: params.messageId ?? null,
      citaTexto: params.citaTexto ?? null,
      estado: params.origen === "EXPERTO" ? "ABIERTA" : "RESPONDIDA",
    },
    select: { id: true },
  });
}

/**
 * Semántica "a quién le toca": responder desde el lado que NO tiene el turno
 * pasa el turno al otro lado; responder desde el mismo lado solo agrega al
 * hilo. RESUELTA es terminal para respuestas (reabrir = nota nueva).
 */
export async function responderNota(params: {
  notaId: string;
  origen: "EXPERTO" | "DEV";
  autor: string;
  texto: string;
}): Promise<{ ok: boolean }> {
  return prisma.$transaction(async (tx) => {
    const nota = await tx.notaRevision.findUnique({
      where: { id: params.notaId },
      select: { id: true, estado: true },
    });
    if (!nota || nota.estado === "RESUELTA") return { ok: false };

    await tx.respuestaNota.create({
      data: { notaId: nota.id, origen: params.origen, autor: params.autor, texto: params.texto },
    });

    const siguiente =
      params.origen === "DEV" && nota.estado === "ABIERTA"
        ? "RESPONDIDA"
        : params.origen === "EXPERTO" && nota.estado === "RESPONDIDA"
          ? "ABIERTA"
          : null;
    if (siguiente) {
      // Guarded write (patrón del proyecto, cf. asignarClasificacion): la
      // transición solo aplica si el estado leído sigue vigente — un perdedor
      // de carrera no pisa la transición del ganador; el hilo converge con la
      // próxima respuesta del otro lado.
      await tx.notaRevision.updateMany({
        where: { id: nota.id, estado: nota.estado },
        data: { estado: siguiente },
      });
    }
    return { ok: true };
  });
}

/** Cualquiera de los dos lados puede cerrar (spec §4). Idempotente. */
export async function resolverNota(notaId: string): Promise<{ ok: boolean }> {
  return prisma.$transaction(async (tx) => {
    const nota = await tx.notaRevision.findUnique({ where: { id: notaId }, select: { id: true } });
    if (!nota) return { ok: false };
    await tx.notaRevision.update({ where: { id: notaId }, data: { estado: "RESUELTA" } });
    return { ok: true };
  });
}
