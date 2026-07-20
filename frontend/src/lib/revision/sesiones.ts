import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "../prisma";
import { threadIdForSession } from "../session";

export interface SesionResumen {
  id: string;
  titulo: string | null;
  creadaPor: string | null;
  actualizadaEn: string;
  notasAbiertas: number;
  notasRespondidas: number;
}

/**
 * Crea una sesión de revisión con sessionId propio server-side: NO toca la
 * cookie anónima ls_session del experto como consumidor (spec §3). El thread
 * de Mastra se crea lazy en el primer turno, igual que en el home.
 */
export async function crearSesionRevision(params: {
  titulo?: string;
  creadaPor: string;
}): Promise<{ id: string; threadId: string }> {
  const sessionId = randomUUID();
  return prisma.conversation.create({
    data: {
      sessionId,
      threadId: threadIdForSession(sessionId),
      esRevision: true,
      titulo: params.titulo ?? null,
      creadaPor: params.creadaPor,
    },
    select: { id: true, threadId: true },
  });
}

/** Listado compartido: todo el equipo legal ve todas las sesiones (spec §2). */
export async function listarSesionesRevision(): Promise<SesionResumen[]> {
  const sesiones = await prisma.conversation.findMany({
    where: { esRevision: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titulo: true,
      creadaPor: true,
      updatedAt: true,
      notas: { select: { estado: true } },
    },
  });
  return sesiones.map((sesion) => ({
    id: sesion.id,
    titulo: sesion.titulo,
    creadaPor: sesion.creadaPor,
    actualizadaEn: sesion.updatedAt.toISOString(),
    notasAbiertas: sesion.notas.filter((nota) => nota.estado === "ABIERTA").length,
    notasRespondidas: sesion.notas.filter((nota) => nota.estado === "RESPONDIDA").length,
  }));
}

/** Gate de aislamiento: solo conversaciones de revisión son accesibles acá. */
export async function getSesionRevision(id: string): Promise<{
  id: string;
  sessionId: string;
  threadId: string;
  titulo: string | null;
  creadaPor: string | null;
} | null> {
  return prisma.conversation.findFirst({
    where: { id, esRevision: true },
    select: { id: true, sessionId: true, threadId: true, titulo: true, creadaPor: true },
  });
}
