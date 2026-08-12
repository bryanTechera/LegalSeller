import "server-only";

import type { z } from "zod";

import type { MaterialSintesis } from "@/lib/casos/sintesis-schema";
import { respuestaSintesisSchema } from "@/lib/casos/sintesis-schema";
import { logger } from "@/utils/logger";

/**
 * Single point of access to the Mastra agents backend. Nothing else reads
 * MASTRA_BASE_URL.
 */

const DEFAULT_BASE_URL = "http://localhost:4112";

/**
 * Todo mensaje que sale de acá viaja con su `createdAt`, y los de un mismo lote
 * separados por al menos esta distancia.
 *
 * Sin `createdAt` propio, `PostgresStore.saveMessages` completa el faltante con
 * `message.createdAt || new Date()` dentro de un `.map()` **sincrónico**: todo el
 * lote cae en el mismo milisegundo. Y un empate de timestamp no es cosmético,
 * porque el desempate de la memoria de Mastra es semánticamente ciego —
 * `_sortMessages` cae en `a.id.localeCompare(b.id)`, o sea el UUID del mensaje —
 * así que el historial le llega al modelo en un orden al azar. Medido en
 * producción el 2026-08-11: 38 turnos empatados, 19 de ellos con la respuesta
 * antes de la consulta, y 26 prompts de conversaciones reales efectivamente
 * enviados así. La separación es de un milisegundo porque es la resolución de la
 * columna `createdAt` (`timestamp` de Postgres vía Date de JS).
 */
const SEPARACION_MINIMA_MS = 1;

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
  /** true → an assistant message in this thread already asked for contact and the user did not answer (BFF-derived from thread history). */
  pedidoContactoHecho?: boolean;
  /** true → el Caso del turno ya tiene contacto (`estado === "CAPTADO"`, herencia incluida). Manda sobre `pedidoContactoHecho`. */
  contactoRegistrado?: boolean;
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
      // La hora de llegada viaja explícita: ver `SEPARACION_MINIMA_MS`. Acá va un
      // solo mensaje, así que alcanza con estampar su recepción — el mensaje del
      // asistente lo fecha Mastra al cerrar el turno, y `generateCreatedAt` lo
      // empuja a `createdAt + 1ms` si el reloj del backend viniera atrasado
      // respecto del BFF.
      messages: [{ role: "user", content: params.message, createdAt: new Date().toISOString() }],
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
          contactoRegistrado: params.contactoRegistrado,
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
  // Base única + offset por posición: el orden del array ES el orden de la
  // conversación, y así queda expresado en el dato en vez de depender de cuándo
  // corrió cada `new Date()`.
  const base = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages.map((message, posicion) => ({
        threadId: params.threadId,
        resourceId: params.resourceId,
        role: message.role,
        content: message.content,
        createdAt: new Date(base + posicion * SEPARACION_MINIMA_MS).toISOString(),
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(`appendThreadMessages responded ${response.status}`);
  }
}

/**
 * Pide la síntesis de un caso al backend Mastra. Sigue siendo este módulo el
 * único que conoce MASTRA_BASE_URL. Nunca tira: la vista del caso tiene que
 * poder renderizar sin síntesis.
 */
export async function pedirSintesis(
  material: MaterialSintesis,
): Promise<z.infer<typeof respuestaSintesisSchema>> {
  try {
    const response = await fetch(`${getMastraBaseUrl()}/sintesis-caso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(material),
    });
    if (!response.ok) {
      logger.warn("sintesis-caso respondió con error", { status: response.status });
      return { status: "error", mensaje: "No se pudo generar la síntesis" };
    }
    const validado = respuestaSintesisSchema.safeParse(await response.json());
    if (!validado.success) {
      logger.warn("respuesta de sintesis-caso con forma inesperada", {
        campos: validado.error.issues.map((issue) => issue.path.join(".")),
      });
      return { status: "error", mensaje: "No se pudo generar la síntesis" };
    }
    return validado.data;
  } catch (error) {
    logger.error("sintesis-caso no respondió", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", mensaje: "No se pudo generar la síntesis" };
  }
}
