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
    // El cursor pagina por `createdAt` (columna inmutable), no por
    // `updatedAt`: gestionar un caso es el flujo normal de esta pantalla y
    // mueve `updatedAt` por definición. Paginar por una columna que la propia
    // acción de la pantalla desplaza hace que "Cargar más" repita una fila y
    // omita otra para siempre (con más de POR_PAGINA casos, el caso que subió
    // al tope reaparece en la página siguiente y el que estaba último en la
    // página vieja se pierde). El orden visible sale de `ultimaActividad`
    // (ver el `.sort()` de abajo), igual que `listarConversaciones`.
    orderBy: { createdAt: "desc" },
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

  const casos = filas
    .map((fila) => ({
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
    }))
    // Orden real de la página: última actividad, no creación — la columna
    // "Última actividad" tiene que reflejar lo que muestra, y gestionar un
    // caso viejo hoy lo tiene que subir. LIMITACIÓN DELIBERADA: este es un
    // reorden INTRA-página (mismo criterio que `listarConversaciones`); el
    // cursor de paginación sigue siendo por `createdAt`, así que un caso
    // viejo con actividad nueva sube dentro de la página en la que cayó por
    // fecha de creación, pero no salta a una página anterior.
    .sort((a, b) => new Date(b.ultimaActividad).getTime() - new Date(a.ultimaActividad).getTime());

  return {
    casos,
    cursor: filas.length === POR_PAGINA ? (filas[filas.length - 1]?.id ?? null) : null,
  };
}
