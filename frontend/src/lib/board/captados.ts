import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { situacionDe } from "@/lib/casos/situacion";
import { prisma } from "@/lib/prisma";

import { casosReales } from "./scope";

export interface CasoCaptado {
  id: string;
  conversationId: string;
  ultimoMensaje: string | null;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  /** Primer párrafo de la síntesis; null si el caso todavía no tiene. */
  situacion: string | null;
}

/**
 * Tope de filas servidas. La pantalla compara este largo contra el contador
 * `captadas` del funnel y avisa cuando recortó: un listado truncado en
 * silencio se lee como "estos son todos los captados del período".
 */
const LIMITE = 100;

const filaUltimoSchema = z.object({
  threadId: z.string(),
  ultimoMensaje: z.coerce.date(),
});

/**
 * Los casos con contacto del período — lo único que un abogado puede accionar.
 *
 * El filtro es `casosReales(desde)` + estado CAPTADO, exactamente el mismo que
 * cuenta `calcularFunnel`. Si acá se filtrara por otra fecha (la del último
 * mensaje, por ejemplo), la tabla y el KPI "Casos captados" mostrarían números
 * distintos para el mismo rango y no habría forma de saber cuál miente.
 */
export async function listarCaptados(desde: Date | null): Promise<CasoCaptado[]> {
  const casos = await prisma.caso.findMany({
    where: { ...casosReales(desde), estado: "CAPTADO" },
    select: {
      id: true,
      conversationId: true,
      contactoNombre: true,
      contactoTelefono: true,
      contactoEmail: true,
      conversation: { select: { threadId: true } },
      sintesis: { select: { contenido: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: LIMITE,
  });
  if (casos.length === 0) return [];

  const threadIds = casos.map((caso) => caso.conversation.threadId);
  const ultimos = filaUltimoSchema.array().parse(
    await prisma.$queryRaw`
      SELECT m.thread_id AS "threadId", MAX(m."createdAt") AS "ultimoMensaje"
      FROM mastra.mastra_messages m
      WHERE m.thread_id IN (${Prisma.join(threadIds)})
      GROUP BY m.thread_id`,
  );
  const porThread = new Map(ultimos.map((fila) => [fila.threadId, fila.ultimoMensaje]));

  return casos
    .map((caso) => ({
      id: caso.id,
      conversationId: caso.conversationId,
      ultimoMensaje: porThread.get(caso.conversation.threadId)?.toISOString() ?? null,
      contactoNombre: caso.contactoNombre,
      contactoTelefono: caso.contactoTelefono,
      contactoEmail: caso.contactoEmail,
      situacion: situacionDe(caso.sintesis?.contenido),
    }))
    .sort((a, b) => {
      // Descendente, con comparación cruda en vez de localeCompare: sobre ISO
      // 8601 en UTC el orden lexicográfico ES el cronológico y no depende de la
      // collation del proceso. Un caso cuya conversación no dejó mensajes
      // persistidos compara como string vacío y queda último, que es donde va.
      const izq = a.ultimoMensaje ?? "";
      const der = b.ultimoMensaje ?? "";
      return izq < der ? 1 : izq > der ? -1 : 0;
    });
}
