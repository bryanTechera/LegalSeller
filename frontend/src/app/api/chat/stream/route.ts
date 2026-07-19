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

    // Two independent buckets: per-session (tight) and per-IP (looser, since
    // several legit users can share an IP). Clearing the session cookie only
    // resets the session bucket — the IP bucket still catches the abuser.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const sessionRate = checkRateLimit(`sess:${sessionId}`);
    const ipRate = checkRateLimit(`ip:${ip}`, { limit: 30 });

    if (!sessionRate.allowed || !ipRate.allowed) {
      const retryAfterSeconds = Math.max(sessionRate.retryAfterSeconds ?? 0, ipRate.retryAfterSeconds ?? 0);
      return NextResponse.json(
        { error: "Demasiados mensajes seguidos. Esperá un momento e intentá de nuevo." },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds || 60) } },
      );
    }
    return await orchestrateChatTurn({ sessionId, message: validation.data.message });
  } catch (error) {
    logger.error("chat/stream failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
