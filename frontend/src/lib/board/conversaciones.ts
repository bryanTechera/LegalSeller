import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import type { FiltrosChats } from "@/lib/validations/board";
import { prisma } from "@/lib/prisma";

import { listarNotasDeSesion, type NotaConRespuestas } from "@/lib/revision/notas";
import { getCasosDeSesion, type CasoSnapshot } from "@/lib/revision/sesiones";
import { construirTimeline, extraerTexto, type ItemTimeline } from "@/lib/revision/timeline";
import { construirBusquedas } from "@/lib/revision/busquedas";
import type { BusquedaCorpus } from "@/lib/revision/fuentes";

import { fechaDesde } from "./rango";
import { conversacionesReales } from "./scope";

export interface ChatResumen {
  id: string;
  fecha: string;
  categoria: string | null;
  estadoCaso: string | null;
  mensajes: number;
  preview: string;
  notas: number;
}

/** Una página del listado. El componente homónimo vive en components/board/Chats. */
export interface PaginaChats {
  chats: ChatResumen[];
  cursor: string | null;
}

const POR_PAGINA = 30;
const LARGO_PREVIEW = 140;

const filaResumenSchema = z.object({
  threadId: z.string(),
  mensajes: z.coerce.number(),
  preview: z.string(),
});

const filaThreadSchema = z.object({ threadId: z.string() });

export async function listarConversaciones(filtros: FiltrosChats): Promise<PaginaChats> {
  const desde = fechaDesde(filtros.rango);

  // La búsqueda acota el conjunto ANTES de paginar. Filtrando después, un
  // término solo se encontraría entre las 30 conversaciones más recientes y
  // el resto quedaría afuera sin aviso — una búsqueda que omite en silencio
  // es peor que no tenerla. Además deja `mensajes` y `preview` correctos:
  // salen de la conversación entera, no de las filas que matchearon.
  let threadsCoincidentes: string[] | null = null;
  if (filtros.busqueda) {
    const filasCoincidentes = filaThreadSchema.array().parse(
      await prisma.$queryRaw`
        SELECT DISTINCT m.thread_id AS "threadId"
        FROM mastra.mastra_messages m
        WHERE m.content::text ILIKE ${`%${filtros.busqueda}%`}`,
    );
    threadsCoincidentes = filasCoincidentes.map((fila) => fila.threadId);
    if (threadsCoincidentes.length === 0) return { chats: [], cursor: null };
  }

  const where: Prisma.ConversationWhereInput = {
    ...conversacionesReales(desde),
    ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(filtros.estado ? { casos: { some: { estado: filtros.estado } } } : {}),
    ...(threadsCoincidentes ? { threadId: { in: threadsCoincidentes } } : {}),
  };

  const filas = await prisma.conversation.findMany({
    where,
    select: {
      id: true,
      threadId: true,
      categoria: true,
      createdAt: true,
      casos: { select: { estado: true } },
      _count: { select: { notas: true } },
    },
    orderBy: { createdAt: "desc" },
    take: POR_PAGINA,
    ...(filtros.cursor ? { skip: 1, cursor: { id: filtros.cursor } } : {}),
  });

  const threadIds = filas.map((fila) => fila.threadId);
  const resumenes =
    threadIds.length === 0
      ? []
      : filaResumenSchema.array().parse(
          await prisma.$queryRaw`
            SELECT m.thread_id AS "threadId",
                   COUNT(*)::float8 AS mensajes,
                   COALESCE(
                     (ARRAY_AGG(m.content::text ORDER BY m."createdAt" ASC)
                      FILTER (WHERE m.role = 'user'))[1],
                     ''
                   ) AS preview
            FROM mastra.mastra_messages m
            WHERE m.thread_id IN (${Prisma.join(threadIds)})
            GROUP BY m.thread_id`,
        );

  const porThread = new Map(resumenes.map((resumen) => [resumen.threadId, resumen]));

  const chats = filas.map((fila) => {
    const resumen = porThread.get(fila.threadId);
    return {
      id: fila.id,
      fecha: fila.createdAt.toISOString(),
      categoria: fila.categoria,
      // Con varios Caso por conversación, el listado muestra el primero como
      // proxy provisorio: el criterio de cuál estado destacar en una fila con
      // N casos queda para la Task que agrega la columna de conteo.
      estadoCaso: fila.casos[0]?.estado ?? null,
      mensajes: resumen?.mensajes ?? 0,
      preview: recortar(resumen?.preview ?? ""),
      notas: fila._count.notas,
    };
  });

  return {
    chats,
    cursor: filas.length === POR_PAGINA ? (filas[filas.length - 1]?.id ?? null) : null,
  };
}

/**
 * El content de mastra_messages viene en varios shapes (string plano, JSON
 * serializado, formato v2 con parts). Se parsea con `extraerTexto`, el mismo
 * helper verificado en producción que usa la timeline de revisión, en vez de
 * limpiar el JSON con regex: una regex que borra las palabras "format",
 * "parts", "type" o "text" también se come las del consultante — "le mande un
 * text a mi jefe" quedaba como "le mande un a mi jefe".
 */
function recortar(crudo: string): string {
  const limpio = extraerTexto(crudo).replace(/\s+/g, " ").trim();
  return limpio.length > LARGO_PREVIEW ? `${limpio.slice(0, LARGO_PREVIEW)}…` : limpio;
}

export interface DetalleConversacion {
  id: string;
  threadId: string;
  categoria: string | null;
  fecha: string;
  timeline: ItemTimeline[];
  busquedas: BusquedaCorpus[];
  casos: CasoSnapshot[];
  notas: NotaConRespuestas[];
}

/**
 * Descarta `input`/`output` de los items `tool-call`: desde la Task 7,
 * `DetalleChat` no renderiza ningún `tool-call` de la timeline (las búsquedas
 * al corpus llegan por su propio camino, `construirBusquedas`, ya agrupadas
 * y livianas) y `resumirTecnico` solo lee `tool`/`agente`/`error`. Sin podar,
 * el detalle del board duplica ~9 KB por llamada a `buscar-documentos` que
 * nadie lee. `construirTimeline` NO cambia de contrato: `feedback:pull`
 * (`exportar-markdown.ts`) sí necesita el payload completo y sigue
 * pidiéndolo directo. `error` se conserva — `resumirTecnico` lo usa.
 */
function sinPayloadDeTools(timeline: ItemTimeline[]): ItemTimeline[] {
  return timeline.map((item) => (item.tipo === "tool-call" ? { ...item, input: null, output: null } : item));
}

/**
 * Detalle de un chat de consultante real. El filtro de conversacionesReales
 * no es cosmético: evita que el detalle del board sirva sesiones de prueba
 * como si fueran conversaciones de producción.
 */
export async function obtenerConversacion(id: string): Promise<DetalleConversacion | null> {
  const conversacion = await prisma.conversation.findFirst({
    where: { id, ...conversacionesReales(null) },
    select: { id: true, threadId: true, categoria: true, createdAt: true },
  });
  if (!conversacion) return null;

  const [timeline, busquedas, casos, notas] = await Promise.all([
    construirTimeline(conversacion.threadId, { conSpans: true }),
    construirBusquedas(conversacion.threadId),
    getCasosDeSesion(conversacion.id),
    listarNotasDeSesion(conversacion.id),
  ]);

  return {
    id: conversacion.id,
    threadId: conversacion.threadId,
    categoria: conversacion.categoria,
    fecha: conversacion.createdAt.toISOString(),
    timeline: sinPayloadDeTools(timeline),
    busquedas,
    casos,
    notas,
  };
}
