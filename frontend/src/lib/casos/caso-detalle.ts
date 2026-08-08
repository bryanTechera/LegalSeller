import "server-only";

import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";

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

  // Va después de tener el caso y con su error ya absorbido por
  // `asegurarSintesis`: la vista tiene que renderizar aunque el resumen falle.
  const sintesis = await asegurarSintesis(caso.id);

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
