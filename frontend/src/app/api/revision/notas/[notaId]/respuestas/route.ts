import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { responderNota } from "@/lib/revision/notas";
import { parseRequestBody, responderNotaSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/** Respuesta del EXPERTO en el hilo (el lado dev responde vía scripts). */
export async function POST(request: Request, { params }: { params: Promise<{ notaId: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { notaId } = await params;
    const validation = await parseRequestBody(request, responderNotaSchema);
    if (!validation.success) return validation.response;

    const result = await responderNota({
      notaId,
      origen: "EXPERTO",
      autor: experto.nombre,
      texto: validation.data.texto,
    });
    if (!result.ok) return NextResponse.json({ error: "La nota no admite respuestas" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("revision/respuestas POST failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
