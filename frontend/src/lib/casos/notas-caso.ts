import "server-only";

import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";

export interface NotaCasoVista {
  id: string;
  autor: string;
  texto: string;
  createdAt: string;
}

/**
 * Nota del equipo legal sobre el caso — típicamente lo que consiguió hablando
 * con el cliente. El autor lo resuelve el llamador desde la sesión del board,
 * nunca viene del body.
 *
 * Devuelve null cuando el caso no existe o pertenece a una sesión de revisión:
 * mismo guard que el resto del board, para no anotar datos de prueba.
 */
export async function crearNotaCaso(params: {
  casoId: string;
  autor: string;
  texto: string;
}): Promise<NotaCasoVista | null> {
  const caso = await prisma.caso.findFirst({
    where: { id: params.casoId, ...casosReales(null) },
    select: { id: true },
  });
  if (!caso) return null;

  const nota = await prisma.notaCaso.create({
    data: { casoId: caso.id, autor: params.autor, texto: params.texto },
    select: { id: true, autor: true, texto: true, createdAt: true },
  });
  return { ...nota, createdAt: nota.createdAt.toISOString() };
}
