import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { listarNotasDeSesion } from "@/lib/revision/notas";
import { getCasoDeSesion, getSesionRevision, publicarSesionRevision } from "@/lib/revision/sesiones";
import { construirTimeline } from "@/lib/revision/timeline";
import { parseRequestBody, publicarSesionSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/** Detalle para la UI del experto: transcript con IDs persistidos + notas. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sesion = await getSesionRevision(id);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const [timeline, notas, caso] = await Promise.all([
      construirTimeline(sesion.threadId),
      listarNotasDeSesion(sesion.id),
      getCasoDeSesion(sesion.id),
    ]);
    return NextResponse.json({
      sesion: {
        id: sesion.id,
        titulo: sesion.titulo,
        creadaPor: sesion.creadaPor,
        origenRevision: sesion.origenRevision,
        borrador: sesion.borrador,
      },
      timeline,
      notas,
      caso,
    });
  } catch (error) {
    logger.error("revision/sesiones/:id GET failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}

/** Publicar una corrida autónoma (borrador → listado compartido). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const validation = await parseRequestBody(request, publicarSesionSchema);
    if (!validation.success) return validation.response;

    const publicada = await publicarSesionRevision(id);
    if (!publicada) return NextResponse.json({ error: "Sesión no encontrada o ya publicada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("revision/sesiones/:id PATCH failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
