import { NextResponse } from "next/server";

import { orchestrateChatTurn } from "@/lib/chat-orchestrator";
import { getOrCreateSessionId } from "@/lib/session";
import { parseRequestBody, sendMessageSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/**
 * SSE proxy: routes each message by the conversation's persisted
 * classification (lib/chat-orchestrator). The browser never talks to the
 * Mastra backend directly.
 * TODO: rate limit per session/IP before exposing to real traffic (Task 14).
 */
export async function POST(request: Request) {
  try {
    const validation = await parseRequestBody(request, sendMessageSchema);
    if (!validation.success) return validation.response;

    const sessionId = await getOrCreateSessionId();
    return await orchestrateChatTurn({ sessionId, message: validation.data.message });
  } catch (error) {
    logger.error("chat/stream failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
