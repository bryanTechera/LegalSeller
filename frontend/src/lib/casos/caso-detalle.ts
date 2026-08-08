import "server-only";

import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { logger } from "@/utils/logger";

import type { NotaCasoVista } from "./notas-caso";
import { asegurarSintesis, type EstadoSintesis } from "./sintesis";

export interface DetalleCaso {
  id: string;
  conversationId: string;
  categoria: string | null;
  subcategorias: string[];
  estado: string;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  creadoEn: string;
  actualizadoEn: string;
  sintesis: EstadoSintesis;
  notas: NotaCasoVista[];
}

/**
 * El caso como lo ve el equipo legal: la síntesis al centro, el contacto para
 * accionar y las notas del equipo. El enlace al chat lo arma la UI con
 * `conversationId` — el transcript sigue viviendo en /board/chats.
 */
export async function obtenerCaso(casoId: string): Promise<DetalleCaso | null> {
  const caso = await prisma.caso.findFirst({
    where: { id: casoId, ...casosReales(null) },
    select: {
      id: true,
      conversationId: true,
      categoria: true,
      subcategorias: true,
      estado: true,
      contactoNombre: true,
      contactoTelefono: true,
      contactoEmail: true,
      createdAt: true,
      updatedAt: true,
      notas: {
        orderBy: { createdAt: "desc" },
        select: { id: true, autor: true, texto: true, createdAt: true },
      },
    },
  });
  if (!caso) return null;

  // Va después de tener el caso. `asegurarSintesis` absorbe el fallo del
  // backend de IA (estado: "error"), pero no todas sus rutas internas están
  // blindadas (p. ej. construirTimeline puede tirar sobre una fila con forma
  // inesperada) — el try/catch cubre esas excepciones sin atenuar. La vista
  // tiene que renderizar con el contacto aunque el resumen falle del todo.
  const sintesis = await obtenerSintesisSinTirar(caso.id);

  return {
    id: caso.id,
    conversationId: caso.conversationId,
    categoria: caso.categoria,
    subcategorias: caso.subcategorias,
    estado: caso.estado,
    contactoNombre: caso.contactoNombre,
    contactoTelefono: caso.contactoTelefono,
    contactoEmail: caso.contactoEmail,
    creadoEn: caso.createdAt.toISOString(),
    actualizadoEn: caso.updatedAt.toISOString(),
    sintesis,
    notas: caso.notas.map((nota) => ({ ...nota, createdAt: nota.createdAt.toISOString() })),
  };
}

/**
 * Envoltorio de `asegurarSintesis` para esta capa: no toca `sintesis.ts`
 * (es de otra task), pero el detalle del caso no puede fallar entero por una
 * excepción no atenuada dentro de esa función (timeline con forma
 * inesperada, blip transitorio de Postgres). Solo logueamos el mensaje del
 * error, nunca contenido del caso.
 */
async function obtenerSintesisSinTirar(casoId: string): Promise<EstadoSintesis> {
  try {
    return await asegurarSintesis(casoId);
  } catch (error) {
    logger.error("asegurarSintesis tiró una excepción, se sirve el caso sin síntesis", {
      mensaje: error instanceof Error ? error.message : "error desconocido",
    });
    return { estado: "error", sintesis: null, generadaEn: null };
  }
}
