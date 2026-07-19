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
import { esCategoriaHabilitada, subcategoriaUnica } from "./dominios";
import { threadIdForSession } from "./session";

const ESCAPES = new Set(["fuera-de-universo", "categoria-no-habilitada"]);
const RECEPCION_AGENT_ID = "recepcion";
const DEGRADED_CATEGORY_MESSAGE =
  "Estamos actualizando la cobertura de ese tema; dejanos tu consulta de nuevo en unos minutos.";

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

/** A one-shot SSE response carrying a single text delta (or nothing, if empty). */
function textOnlyResponse(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (text.length > 0) controller.enqueue(encodeSseText(text));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}

/**
 * Persists a classification signal for an outcome that will NOT chain to a
 * category agent (escape / disabled-category / sensitive-case paths) —
 * wrapped so a DB failure here never swallows the receptor's already-
 * buffered farewell text, which still has to reach the client (final review,
 * bonus hardening).
 */
async function persistWithoutChaining(sessionId: string, args: AsignacionArgs): Promise<void> {
  try {
    await asignarClasificacion({ sessionId, ...args });
  } catch (error) {
    logger.error("asignarClasificacion failed for a no-chain outcome", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
    onToolCall: async (toolName, args) => {
      if (toolName === "asignar-clasificacion") {
        const parsed = asignacionArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.warn("tool-call args failed validation", { toolName });
          return;
        }
        asignacion = parsed.data;
        return;
      }
      if (toolName === "registrar-caso") {
        // The receptor also has registrar-caso available — for out-of-
        // coverage lead capture (spec §3/§7/§10) it may run BEFORE any
        // classification exists. The conversation row already exists (created
        // by getOrCreateConversation earlier in orchestrateChatTurn), so this
        // is safe to persist here even though the rest of this turn is
        // readOnly (final review gap #1 — was silently dropped before).
        const parsed = registrarCasoArgsSchema.safeParse(args);
        if (!parsed.success) {
          logger.warn("tool-call args failed validation", { toolName });
          return;
        }
        try {
          await registrarDatosCaso({ sessionId: params.sessionId, ...parsed.data });
        } catch (_error) {
          // Persistence must never break the user-facing stream.
          logger.error("tool-call persistence failed", { toolName });
        }
      }
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
    // Guard against a category that was enabled when persisted but has since
    // been disabled in the registry (final review gap #3, regime path):
    // degrade gracefully instead of calling an agent the backend may no
    // longer serve. The persisted classification is left untouched.
    if (!(await esCategoriaHabilitada(conversation.categoria))) {
      logger.warn("persisted category no longer enabled", { categoria: conversation.categoria });
      return textOnlyResponse(DEGRADED_CATEGORY_MESSAGE);
    }
    return callCategoryAgent({
      sessionId: params.sessionId,
      categoria: conversation.categoria,
      message: params.message,
    });
  }

  const outcome = await runReceptor(params);

  if (outcome.kind === "clasificada" && outcome.args) {
    if (!(await esCategoriaHabilitada(outcome.args.categoria))) {
      // The receptor classified into a category that isn't actually enabled
      // — treat it as an escape instead of the real category: persist a
      // categoria-no-habilitada signal (temaDetectado carries what it tried
      // to assign) and never chain (final review gap #3).
      await persistWithoutChaining(params.sessionId, {
        categoria: "categoria-no-habilitada",
        temaDetectado: outcome.args.categoria,
        brief: outcome.args.brief,
        casoSensible: outcome.args.casoSensible,
      });
    } else if (outcome.args.casoSensible) {
      // Sensitive case: never hand off to the category agent even though the
      // category is enabled — the receptor's own buffered text already
      // covers the help-channel short-circuit (spec §3/§7, final review gap
      // #2). The real classification is still persisted.
      await persistWithoutChaining(params.sessionId, outcome.args);
    } else {
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
  }

  if (outcome.kind === "escape" && outcome.args) {
    await persistWithoutChaining(params.sessionId, outcome.args);
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

  return textOnlyResponse(outcome.text);
}
