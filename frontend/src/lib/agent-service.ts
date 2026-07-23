import "server-only";

/**
 * Single point of access to the Mastra agents backend. Nothing else reads
 * MASTRA_BASE_URL.
 */

const DEFAULT_BASE_URL = "http://localhost:4112";

export function getMastraBaseUrl(): string {
  return process.env.MASTRA_BASE_URL ?? DEFAULT_BASE_URL;
}

export interface StreamAgentParams {
  /** Registry-driven agent id ("recepcion" or a category id). */
  agentId: string;
  threadId: string;
  /** Business user id — used as Mastra resourceId. */
  userId: string;
  userName?: string;
  message: string;
  /** Case brief from the receptor's classification, re-injected so the category agent never re-asks. */
  casoBrief?: string;
  /** true → an assistant message in this thread already asked for contact (BFF-derived; the captacion-caso rule switches variant on it). */
  pedidoContactoHecho?: boolean;
  /** true → the turn persists nothing (receptor runs; the category agent owns the durable turn). */
  memoryReadOnly?: boolean;
  signal?: AbortSignal;
}

export async function streamAgentMessage(params: StreamAgentParams): Promise<Response> {
  const url = `${getMastraBaseUrl()}/api/agents/${params.agentId}/stream`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      messages: [{ role: "user", content: params.message }],
      threadId: params.threadId,
      resourceId: params.userId,
      // Gotcha en vivo (2026-07-19, Task 13, ver CLAUDE.md): el modern
      // `/stream` route (no el `-legacy`) resuelve memoria SOLO desde
      // `body.memory` — el threadId/resourceId de nivel superior se ignoran
      // para persistencia (confirmado con curl directo: sin este campo, un
      // turno sin memoryReadOnly no persiste NADA en el thread). Debe
      // enviarse siempre, con `options.readOnly` solo cuando corresponde.
      memory: {
        thread: params.threadId,
        resource: params.userId,
        ...(params.memoryReadOnly ? { options: { readOnly: true } } : {}),
      },
      requestContext: {
        threadId: params.threadId,
        resourceId: params.userId,
        readOnly: {
          userId: params.userId,
          userName: params.userName,
          casoBrief: params.casoBrief,
          pedidoContactoHecho: params.pedidoContactoHecho,
        },
      },
    }),
  });
}

/**
 * Tolerant text extraction from `GET /api/memory/threads/:id/messages`
 * (verified live 2026-07-23): each message is `{ role, content }` where
 * `content` is the v2 shape `{ format: 2, parts: [...], content: "texto" }` —
 * the flat string nests at `content.content`. Accepts also a plain-string
 * `content` and a parts-only payload so a @mastra/core bump degrades
 * gracefully instead of silently reading `undefined` (same fallback style as
 * the SSE parser).
 */
export function extractAssistantTexts(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") return [];
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message) => {
    const record = message as Record<string, unknown>;
    if (record.role !== "assistant") return [];
    const content = record.content;
    if (typeof content === "string") return [content];
    if (content && typeof content === "object") {
      const nested = (content as Record<string, unknown>).content;
      if (typeof nested === "string") return [nested];
      const parts = (content as Record<string, unknown>).parts;
      if (Array.isArray(parts)) {
        const texts = parts
          .map((part) => part as Record<string, unknown>)
          .filter((part) => part.type === "text" && typeof part.text === "string")
          .map((part) => part.text as string);
        if (texts.length > 0) return [texts.join("\n")];
      }
    }
    return [];
  });
}

/** Assistant-message texts of a thread, for BFF-side state derivation (e.g. pedido de contacto ya hecho). */
export async function fetchAssistantTexts(params: { threadId: string; agentId: string }): Promise<string[]> {
  const url = `${getMastraBaseUrl()}/api/memory/threads/${params.threadId}/messages?agentId=${params.agentId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`thread messages responded ${response.status}`);
  }
  return extractAssistantTexts(await response.json());
}

/**
 * Slow-path persistence: append the receptor's question exchange to the shared
 * thread. Uses `POST /api/memory/save-messages` (Task 8, 2026-07-19: the
 * originally-assumed `POST /api/memory/threads/:threadId/messages` does not exist
 * in the installed version — that path is GET-only). `threadId`/`resourceId` go on
 * each message, not as a sibling top-level field.
 *
 * The endpoint requires the thread to already exist (500 `"Thread ... not found"`
 * otherwise) — no implicit creation. In the BFF's actual flow this is expected to
 * be a no-op in practice: the immediately-preceding readOnly stream call to
 * `recepcion` on this same threadId already creates the thread row as a side
 * effect (Task 8 finding). Still, callers must not assume this holds for every
 * path into `appendThreadMessages` — if a caller ever hits it without a prior
 * readOnly turn on that thread, `POST /api/memory/threads` must run first.
 */
export async function appendThreadMessages(params: {
  threadId: string;
  agentId: string;
  resourceId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<void> {
  const url = `${getMastraBaseUrl()}/api/memory/save-messages?agentId=${params.agentId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages.map((message) => ({
        threadId: params.threadId,
        resourceId: params.resourceId,
        role: message.role,
        content: message.content,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(`appendThreadMessages responded ${response.status}`);
  }
}
