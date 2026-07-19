import "server-only";

import { createSseLineSplitter, parseSseData } from "@/utils/sse";
import { logger } from "@/utils/logger";

import { appendThreadMessages, streamAgentMessage } from "./agent-service";
import {
  type AsignacionArgs,
  asignacionArgsSchema,
  correccionArgsSchema,
  registrarCasoArgsSchema,
} from "./chat-orchestrator-schemas";
import {
  asignarClasificacion,
  corregirClasificacion,
  getOrCreateConversation,
  registrarDatosCaso,
} from "./clasificacion";
import { subcategoriaUnica } from "./dominios";
import { threadIdForSession } from "./session";

const ESCAPES = new Set(["fuera-de-universo", "categoria-no-habilitada"]);
const RECEPCION_AGENT_ID = "recepcion";

interface ReceptorOutcome {
  kind: "clasificada" | "escape" | "pregunta";
  args?: AsignacionArgs;
  text: string;
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

function encodeSseText(text: string): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify({ type: "text-delta", payload: { text } })}\n\n`);
}

/**
 * Consumes an upstream SSE response to completion, invoking callbacks per
 * parsed event. Decoupled from the client connection: it always drains fully
 * so observed tool-calls are persisted even if the browser disconnected
 * (spec §7 hardening #1).
 */
async function consumeUpstream(
  upstream: Response,
  handlers: {
    onText?: (text: string, raw: string) => void | Promise<void>;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void | Promise<void>;
    onError?: () => void | Promise<void>;
    onRaw?: (rawLine: string) => void | Promise<void>;
  },
): Promise<void> {
  if (!upstream.body) return;
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const feed = createSseLineSplitter();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const data of feed(decoder.decode(value, { stream: true }))) {
      await handlers.onRaw?.(data);
      const event = parseSseData(data);
      if (!event) continue;
      if (event.kind === "text") await handlers.onText?.(event.text, data);
      if (event.kind === "tool-call") await handlers.onToolCall?.(event.toolName, event.args);
      if (event.kind === "error") await handlers.onError?.();
    }
  }
}

/** Runs the receptor turn (readOnly memory), buffering everything. */
async function runReceptor(params: { sessionId: string; message: string }): Promise<ReceptorOutcome> {
  const upstream = await streamAgentMessage({
    agentId: RECEPCION_AGENT_ID,
    threadId: threadIdForSession(params.sessionId),
    userId: params.sessionId,
    message: params.message,
    memoryReadOnly: true,
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`receptor stream responded ${upstream.status}`);
  }

  let asignacion: AsignacionArgs | null = null;
  let text = "";
  await consumeUpstream(upstream, {
    onText: (delta) => {
      text += delta;
    },
    onToolCall: (toolName, args) => {
      if (toolName !== "asignar-clasificacion") return;
      const parsed = asignacionArgsSchema.safeParse(args);
      if (!parsed.success) {
        logger.warn("tool-call args failed validation", { toolName });
        return;
      }
      asignacion = parsed.data;
    },
    onError: () => {
      logger.warn("receptor stream error event", {});
    },
  });

  if (asignacion) {
    const kind = ESCAPES.has((asignacion as AsignacionArgs).categoria) ? "escape" : "clasificada";
    return { kind, args: asignacion, text };
  }
  return { kind: "pregunta", text };
}

/** Streams a category-agent turn to the client while observing case tool-calls. */
function pipeCategoryTurn(params: {
  sessionId: string;
  upstream: Response;
}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      void consumeUpstream(params.upstream, {
        onRaw: (raw) => {
          try {
            controller.enqueue(encoder.encode(`data: ${raw}\n\n`));
          } catch {
            // Client gone — keep draining so tool-calls still persist.
          }
        },
        onToolCall: async (toolName, args) => {
          try {
            if (toolName === "registrar-caso") {
              const parsed = registrarCasoArgsSchema.safeParse(args);
              if (!parsed.success) {
                logger.warn("tool-call args failed validation", { toolName });
                return;
              }
              await registrarDatosCaso({ sessionId: params.sessionId, ...parsed.data });
            } else if (toolName === "corregir-clasificacion") {
              const parsed = correccionArgsSchema.safeParse(args);
              if (!parsed.success) {
                logger.warn("tool-call args failed validation", { toolName });
                return;
              }
              const result = await corregirClasificacion({ sessionId: params.sessionId, ...parsed.data });
              if (!result.aplicada) logger.warn("corregir-clasificacion rejected", { toolName });
            }
          } catch (error) {
            // Persistence must never break the user-facing stream.
            logger.error("tool-call persistence failed", {
              toolName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      })
        .catch((error: unknown) => {
          logger.error("upstream consumption failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}

async function callCategoryAgent(params: {
  sessionId: string;
  categoria: string;
  message: string;
  casoBrief?: string;
}): Promise<Response> {
  const upstream = await streamAgentMessage({
    agentId: params.categoria,
    threadId: threadIdForSession(params.sessionId),
    userId: params.sessionId,
    message: params.message,
    casoBrief: params.casoBrief,
    // NOTE: no client signal — upstream consumption is decoupled from aborts.
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`category agent stream responded ${upstream.status}`);
  }
  return pipeCategoryTurn({ sessionId: params.sessionId, upstream });
}

/**
 * One chat turn (spec §7): route by persisted classification; without it, run
 * the receptor and either chain to the category agent in the SAME response
 * (fast-path) or emit the receptor's question (slow-path, appended to the
 * thread since the receptor runs readOnly).
 */
export async function orchestrateChatTurn(params: { sessionId: string; message: string }): Promise<Response> {
  const conversation = await getOrCreateConversation(params.sessionId);

  if (conversation.categoria) {
    return callCategoryAgent({
      sessionId: params.sessionId,
      categoria: conversation.categoria,
      message: params.message,
    });
  }

  const outcome = await runReceptor(params);

  if (outcome.kind === "clasificada" && outcome.args) {
    const asignada = await asignarClasificacion({ sessionId: params.sessionId, ...outcome.args });
    if (asignada.categoria) {
      const unica = await subcategoriaUnica(asignada.categoria);
      if (unica && !outcome.args.subcategoria) {
        await registrarDatosCaso({ sessionId: params.sessionId, subcategorias: [unica] });
      } else if (outcome.args.subcategoria) {
        await registrarDatosCaso({ sessionId: params.sessionId, subcategorias: [outcome.args.subcategoria] });
      }
      return callCategoryAgent({
        sessionId: params.sessionId,
        categoria: asignada.categoria,
        message: params.message,
        casoBrief: outcome.args.brief,
      });
    }
  }

  if (outcome.kind === "escape" && outcome.args) {
    await asignarClasificacion({ sessionId: params.sessionId, ...outcome.args });
  }

  // Question / escape farewell: emit buffered receptor text and persist the
  // exchange (the receptor ran readOnly, so nothing was saved upstream).
  if (outcome.text.length > 0) {
    await appendThreadMessages({
      threadId: threadIdForSession(params.sessionId),
      agentId: RECEPCION_AGENT_ID,
      resourceId: params.sessionId,
      messages: [
        { role: "user", content: params.message },
        { role: "assistant", content: outcome.text },
      ],
    }).catch((error: unknown) => {
      logger.error("appendThreadMessages failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (outcome.text.length > 0) controller.enqueue(encodeSseText(outcome.text));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}
