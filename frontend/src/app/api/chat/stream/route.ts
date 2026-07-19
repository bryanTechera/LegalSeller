import { NextResponse } from "next/server";

import { orchestrateChatTurn } from "@/lib/chat-orchestrator";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrCreateSessionId } from "@/lib/session";
import { parseRequestBody, sendMessageSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/**
 * SSE proxy: routes each message by the conversation's persisted
 * classification (lib/chat-orchestrator). The browser never talks to the
 * Mastra backend directly.
 */
export async function POST(request: Request) {
  try {
    const validation = await parseRequestBody(request, sendMessageSchema);
    if (!validation.success) return validation.response;

    const sessionId = await getOrCreateSessionId();
    const rate = checkRateLimit(sessionId);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados mensajes seguidos. Esperá un momento e intentá de nuevo." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }
    return await orchestrateChatTurn({ sessionId, message: validation.data.message });
  } catch (error) {
    logger.error("chat/stream failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
