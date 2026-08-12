import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { situacionDe } from "@/lib/casos/situacion";
import { prisma } from "@/lib/prisma";
import type { FiltrosCasos } from "@/lib/validations/board";

import { fechaDesde } from "./rango";
import { casosReales } from "./scope";

export interface CasoResumen {
  id: string;
  conversationId: string;
  fecha: string;
  /** MAX(createdAt) de mastra_messages; cae a `updatedAt` del caso si el
   * thread todavía no tiene mensajes persistidos. */
  ultimaActividad: string;
  gestion: string;
  estado: string;
  categoria: string | null;
  subcategorias: string[];
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  /** Primer párrafo de la síntesis ya guardada; null si el caso no tiene. */
  situacion: string | null;
}

export interface PaginaCasos {
  casos: CasoResumen[];
  cursor: string | null;
}

const POR_PAGINA = 30;

const filaUltimoSchema = z.object({
  threadId: z.string(),
  ultimoMensaje: z.coerce.date(),
});

/**
 * La bandeja de casos del board. `situacion` sale de la síntesis YA guardada:
 * generarla acá sería una llamada al modelo por fila (`asegurarSintesis`), y
 * treinta por página convierten la bandeja en un cuello de botella. El caso
 * sin síntesis la genera al abrir su ficha, que es donde el costo se paga una
 * vez y alguien lo está mirando.
 */
export async function listarCasos(filtros: FiltrosCasos): Promise<PaginaCasos> {
  const desde = fechaDesde(filtros.rango);

  const where: Prisma.CasoWhereInput = {
    ...casosReales(desde),
    ...(filtros.gestion ? { gestion: filtros.gestion } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(filtros.contacto
      ? {
          OR: [
            { contactoNombre: { contains: filtros.contacto, mode: "insensitive" } },
            { contactoTelefono: { contains: filtros.contacto, mode: "insensitive" } },
            { contactoEmail: { contains: filtros.contacto, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const filas = await prisma.caso.findMany({
    where,
    select: {
      id: true,
      conversationId: true,
      gestion: true,
      estado: true,
      categoria: true,
      subcategorias: true,
      contactoNombre: true,
      contactoTelefono: true,
      contactoEmail: true,
      createdAt: true,
      updatedAt: true,
      conversation: { select: { threadId: true } },
      sintesis: { select: { contenido: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: POR_PAGINA,
    ...(filtros.cursor ? { skip: 1, cursor: { id: filtros.cursor } } : {}),
  });
  if (filas.length === 0) return { casos: [], cursor: null };

  const threadIds = filas.map((fila) => fila.conversation.threadId);
  const ultimos = filaUltimoSchema.array().parse(
    await prisma.$queryRaw`
      SELECT m.thread_id AS "threadId", MAX(m."createdAt") AS "ultimoMensaje"
      FROM mastra.mastra_messages m
      WHERE m.thread_id IN (${Prisma.join(threadIds)})
      GROUP BY m.thread_id`,
  );
  const porThread = new Map(ultimos.map((fila) => [fila.threadId, fila.ultimoMensaje]));

  const casos = filas.map((fila) => ({
    id: fila.id,
    conversationId: fila.conversationId,
    fecha: fila.createdAt.toISOString(),
    ultimaActividad: (porThread.get(fila.conversation.threadId) ?? fila.updatedAt).toISOString(),
    gestion: fila.gestion,
    estado: fila.estado,
    categoria: fila.categoria,
    subcategorias: fila.subcategorias,
    contactoNombre: fila.contactoNombre,
    contactoTelefono: fila.contactoTelefono,
    contactoEmail: fila.contactoEmail,
    situacion: situacionDe(fila.sintesis?.contenido),
  }));

  return {
    casos,
    cursor: filas.length === POR_PAGINA ? (filas[filas.length - 1]?.id ?? null) : null,
  };
}
