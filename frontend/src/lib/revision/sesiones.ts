import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "../prisma";
import { threadIdForSession } from "../session";

export interface SesionResumen {
  id: string;
  titulo: string | null;
  creadaPor: string | null;
  origenRevision: "EXPERTO" | "AUTONOMA" | null;
  borrador: boolean;
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
  origen?: "autonoma" | undefined;
}): Promise<{ id: string; threadId: string }> {
  const sessionId = randomUUID();
  const esAutonoma = params.origen === "autonoma";
  return prisma.conversation.create({
    data: {
      sessionId,
      threadId: threadIdForSession(sessionId),
      esRevision: true,
      titulo: params.titulo ?? null,
      creadaPor: params.creadaPor,
      origenRevision: esAutonoma ? "AUTONOMA" : "EXPERTO",
      // Las corridas autónomas nacen fuera del listado compartido (spec §1).
      borrador: esAutonoma,
    },
    select: { id: true, threadId: true },
  });
}

/**
 * Listado compartido: todo el equipo legal ve todas las sesiones (spec §2).
 * Los borradores (corridas autónomas sin publicar) quedan afuera salvo pedido
 * explícito del runner.
 */
export async function listarSesionesRevision(options?: { incluirBorradores?: boolean }): Promise<SesionResumen[]> {
  const sesiones = await prisma.conversation.findMany({
    where: { esRevision: true, ...(options?.incluirBorradores ? {} : { borrador: false }) },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titulo: true,
      creadaPor: true,
      origenRevision: true,
      borrador: true,
      updatedAt: true,
      notas: { select: { estado: true } },
    },
  });
  return sesiones.map((sesion) => ({
    id: sesion.id,
    titulo: sesion.titulo,
    creadaPor: sesion.creadaPor,
    origenRevision: sesion.origenRevision,
    borrador: sesion.borrador,
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
  origenRevision: "EXPERTO" | "AUTONOMA" | null;
  borrador: boolean;
} | null> {
  return prisma.conversation.findFirst({
    where: { id, esRevision: true },
    select: {
      id: true,
      sessionId: true,
      threadId: true,
      titulo: true,
      creadaPor: true,
      origenRevision: true,
      borrador: true,
    },
  });
}

/** Publica una corrida autónoma: sale de borrador y entra al listado compartido. */
export async function publicarSesionRevision(id: string): Promise<boolean> {
  const result = await prisma.conversation.updateMany({
    where: { id, esRevision: true, borrador: true },
    data: { borrador: false },
  });
  return result.count === 1;
}

export interface CasoSnapshot {
  estado: string;
  categoria: string | null;
  subcategorias: string[];
  resumen: unknown;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  eventos: { tipo: string; payload: unknown; createdAt: string }[];
}

/**
 * Snapshot del Caso de una sesión (el id de la sesión ES el Conversation.id).
 * Alimenta el reporte del runner de escenarios y deja el dato disponible
 * para la UI de revisión.
 */
export async function getCasoDeSesion(conversationId: string): Promise<CasoSnapshot | null> {
  const caso = await prisma.caso.findUnique({
    where: { conversationId },
    include: { eventos: { orderBy: { createdAt: "asc" } } },
  });
  if (!caso) return null;
  return {
    estado: caso.estado,
    categoria: caso.categoria,
    subcategorias: caso.subcategorias,
    resumen: caso.resumen,
    contactoNombre: caso.contactoNombre,
    contactoTelefono: caso.contactoTelefono,
    contactoEmail: caso.contactoEmail,
    eventos: caso.eventos.map((evento) => ({
      tipo: evento.tipo,
      payload: evento.payload,
      createdAt: evento.createdAt.toISOString(),
    })),
  };
}
