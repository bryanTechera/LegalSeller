import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { crearSesionRevision, listarSesionesRevision } from "@/lib/revision/sesiones";
import { crearSesionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function GET(request: Request) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const incluirBorradores = new URL(request.url).searchParams.get("borradores") === "1";
    return NextResponse.json({ sesiones: await listarSesionesRevision({ incluirBorradores }) });
  } catch (error) {
    logger.error("revision/sesiones GET failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = await parseRequestBody(request, crearSesionSchema);
    if (!validation.success) return validation.response;

    const sesion = await crearSesionRevision({
      titulo: validation.data.titulo,
      creadaPor: experto.nombre,
      origen: validation.data.origen,
    });
    return NextResponse.json({ sesion }, { status: 201 });
  } catch (error) {
    logger.error("revision/sesiones POST failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
