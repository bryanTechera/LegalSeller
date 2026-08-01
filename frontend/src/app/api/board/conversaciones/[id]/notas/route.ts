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

    // origen EXPERTO como en /revision: en este sistema el browser ES el lado
    // experto y el CLI (`feedback:respond`) es el lado dev — la máquina de
    // estados de responderNota está construida sobre esa correspondencia.
    // La nota nace ABIERTA, o sea pendiente del equipo dev, que es lo que
    // levanta `feedback:pull`.
    const nota = await crearNota({
      conversationId: conversacion.id,
      origen: "EXPERTO",
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
