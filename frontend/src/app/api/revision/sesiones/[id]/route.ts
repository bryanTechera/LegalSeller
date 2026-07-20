import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { listarNotasDeSesion } from "@/lib/revision/notas";
import { getSesionRevision } from "@/lib/revision/sesiones";
import { construirTimeline } from "@/lib/revision/timeline";
import { logger } from "@/utils/logger";

/** Detalle para la UI del experto: transcript con IDs persistidos + notas. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sesion = await getSesionRevision(id);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const [timeline, notas] = await Promise.all([
      construirTimeline(sesion.threadId),
      listarNotasDeSesion(sesion.id),
    ]);
    return NextResponse.json({
      sesion: { id: sesion.id, titulo: sesion.titulo, creadaPor: sesion.creadaPor },
      timeline,
      notas,
    });
  } catch (error) {
    logger.error("revision/sesiones/:id GET failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
