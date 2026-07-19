/**
 * Tolerant extraction of text deltas from the agent's SSE stream (AI SDK
 * UI-message stream emitted by Mastra). Unknown event types are ignored so
 * protocol additions don't break the chat.
 */

export interface SseTextEvent {
  kind: "text";
  text: string;
}

export interface SseErrorEvent {
  kind: "error";
  message: string;
}

export type SseEvent = SseTextEvent | SseErrorEvent | null;

/** Parses one `data: ...` payload. Returns null for events without user-visible text. */
export function parseSseData(data: string): SseEvent {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") return null;

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  const event = payload as Record<string, unknown>;
  const type = typeof event.type === "string" ? event.type : "";
  const nested = (event.payload && typeof event.payload === "object" ? event.payload : {}) as Record<string, unknown>;

  if (type === "text-delta") {
    // Mastra native stream nests the text in payload.text; AI SDK formats
    // put it at the top level (delta/textDelta/text). Accept both.
    const delta = nested.text ?? nested.delta ?? event.delta ?? event.textDelta ?? event.text;
    return typeof delta === "string" && delta.length > 0 ? { kind: "text", text: delta } : null;
  }
  if (type === "error") {
    const raw = nested.error ?? nested.message ?? event.errorText ?? event.error;
    const message = typeof raw === "string" && raw.length > 0 ? raw : "El asistente devolvió un error";
    return { kind: "error", message };
  }
  return null;
}

/**
 * Incremental splitter for an SSE byte stream: feed chunks, get complete
 * `data:` payloads. Keeps the trailing partial line in an internal buffer.
 */
export function createSseLineSplitter(): (chunk: string) => string[] {
  let buffer = "";
  return (chunk: string): string[] => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    return lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());
  };
}
