import { NextResponse } from "next/server";

import { orchestrateChatTurn } from "@/lib/chat-orchestrator";
import { checkRateLimit } from "@/lib/rate-limit";
import { getExperto } from "@/lib/revision/experto-cookie";
import { getSesionRevision } from "@/lib/revision/sesiones";
import { mensajeRevisionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

/**
 * Turno de chat de una sesión de revisión: mismo pipeline que el home
 * (orchestrateChatTurn — receptor, clasificación, agente de categoría,
 * captación), con el sessionId de la sesión elegida. El experto testea
 * exactamente lo que ve un consultante.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sesion = await getSesionRevision(id);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const rate = checkRateLimit(`revision-chat:${sesion.sessionId}`);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados mensajes seguidos. Esperá un momento e intentá de nuevo." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const validation = await parseRequestBody(request, mensajeRevisionSchema);
    if (!validation.success) return validation.response;

    return await orchestrateChatTurn({ sessionId: sesion.sessionId, message: validation.data.message });
  } catch (error) {
    logger.error("revision/mensajes failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "No pudimos hablar con el asistente. Intentá de nuevo en unos instantes." },
      { status: 502 },
    );
  }
}
