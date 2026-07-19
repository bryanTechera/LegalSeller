import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

const SESSION_COOKIE = "ls_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * v1 identity: anonymous HttpOnly session cookie. The returned id is both the
 * Mastra resourceId and the conversation isolation key (one thread per
 * session). Callable from Route Handlers and Server Actions (cookie writes are
 * not allowed in Server Components).
 */
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing && UUID_PATTERN.test(existing)) {
    return existing;
  }

  const sessionId = randomUUID();
  store.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return sessionId;
}

/** Thread key derivation — single conversation per anonymous session in v1. */
export function threadIdForSession(sessionId: string): string {
  return `chat-${sessionId}`;
}
