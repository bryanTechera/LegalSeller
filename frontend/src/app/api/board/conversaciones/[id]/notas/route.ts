import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { obtenerConversacion } from "@/lib/board/conversaciones";
import { crearNota } from "@/lib/revision/notas";
import { crearNotaSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    const autor = sesion?.user?.name?.trim() || sesion?.user?.email?.trim();
    if (!autor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const conversacion = await obtenerConversacion(id);
    if (!conversacion) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const validation = await parseRequestBody(request, crearNotaSchema);
    if (!validation.success) return validation.response;

    // origen DEV: la nota nace del equipo técnico mirando producción, así que
    // queda RESPONDIDA (pendiente del experto), no ABIERTA.
    const nota = await crearNota({
      conversationId: conversacion.id,
      origen: "DEV",
      autor,
      texto: validation.data.texto,
      messageId: validation.data.messageId,
      citaTexto: validation.data.citaTexto,
      alcance: "chat-real",
    });
    if (!nota) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ nota }, { status: 201 });
  } catch (error) {
    logger.error("board/conversaciones/[id]/notas POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
