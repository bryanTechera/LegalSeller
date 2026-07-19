import { NextResponse } from "next/server";

import { streamAgentMessage } from "@/lib/agent-service";
import { getOrCreateSessionId, threadIdForSession } from "@/lib/session";
import { parseRequestBody, sendMessageSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/**
 * SSE proxy to the global receptor agent. The browser never talks to the Mastra
 * backend directly.
 *
 * v1: public route with anonymous session identity (cookie). The session id
 * is the Mastra resourceId and derives the thread — that is the isolation
 * boundary. TODO: rate limit per session/IP before exposing to real traffic.
 */
export async function POST(request: Request) {
  try {
    const validation = await parseRequestBody(request, sendMessageSchema);
    if (!validation.success) return validation.response;

    const sessionId = await getOrCreateSessionId();

    const upstream = await streamAgentMessage({
      agentId: "recepcion",
      threadId: threadIdForSession(sessionId),
      userId: sessionId,
      message: validation.data.message,
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      logger.error("Agent stream failed", { status: upstream.status });
      return NextResponse.json({ error: "El asistente no está disponible en este momento" }, { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("chat/stream failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
