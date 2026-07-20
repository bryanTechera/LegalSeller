import { NextResponse } from "next/server";

import { rotateSessionId } from "@/lib/session";
import { logger } from "@/utils/logger";

/**
 * Starts a chat from scratch by rotating the anonymous session cookie. No DB
 * write happens here: the new Conversation/thread is created lazily on the
 * next message. Cheap by design — the per-IP rate limit on /api/chat/stream
 * still bounds abuse from cookie rotation.
 */
export async function POST() {
  try {
    await rotateSessionId();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("chat/reset failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
