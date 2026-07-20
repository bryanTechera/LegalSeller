import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { crearNota } from "@/lib/revision/notas";
import { getSesionRevision } from "@/lib/revision/sesiones";
import { crearNotaSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sesion = await getSesionRevision(id);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const validation = await parseRequestBody(request, crearNotaSchema);
    if (!validation.success) return validation.response;

    const nota = await crearNota({
      conversationId: sesion.id,
      origen: "EXPERTO",
      autor: experto.nombre,
      texto: validation.data.texto,
      messageId: validation.data.messageId,
      citaTexto: validation.data.citaTexto,
    });
    if (!nota) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
    return NextResponse.json({ nota }, { status: 201 });
  } catch (error) {
    logger.error("revision/notas POST failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
