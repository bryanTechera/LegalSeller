import "server-only";

import type { ZodError } from "zod";

import { createSseLineSplitter, parseSseData } from "@/utils/sse";
import { logger } from "@/utils/logger";

import { appendThreadMessages, fetchAssistantTexts, streamAgentMessage } from "./agent-service";
import {
  type AsignacionArgs,
  asignacionArgsSchema,
  correccionArgsSchema,
  derivarTemaArgsSchema,
  registrarCasoArgsSchema,
} from "./chat-orchestrator-schemas";
import {
  abrirCasoFueraDeCobertura,
  abrirOReactivarCaso,
  asignarClasificacion,
  corregirClasificacion,
  getOrCreateConversation,
  registrarDatosCaso,
  registrarIntentoExtraccion,
  resolverCasoActivo,
} from "./clasificacion";
import { esCategoriaHabilitada, subcategoriaUnica } from "./dominios";
import { contienePedidoContacto } from "./pedido-contacto";
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

/**
 * Un parseo fallido descarta la tool-call ENTERA y el turno sigue como si nada
 * (nunca romper el stream del usuario), así que este log es la única señal de
 * que un turno perdió datos. Van las RUTAS de los campos que fallaron y sus
 * códigos —nunca los valores, que son PII del consultante— porque sin ellas el
 * warn no distingue "el modelo cambió de shape" de "payload adversarial": fue
 * exactamente lo que dejó correr sin ruido el drop de los `null` de GPT-5.6.
 */
function avisarArgsInvalidos(toolName: string, error: ZodError): void {
  logger.warn("tool-call args failed validation", {
    toolName,
    campos: error.issues.map((issue) => issue.path.map(String).join(".")),
    codigos: error.issues.map((issue) => issue.code),
  });
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

function encodeSseError(): Uint8Array {
  // El mensaje upstream se descarta a propósito: el cliente ya muestra su
  // propio texto genérico, y reenviarlo filtraría detalle del backend.
  return new TextEncoder().encode(
    `data: ${JSON.stringify({ type: "error", payload: { error: "stream-error" } })}\n\n`,
  );
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
    onData?: (tipo: string, data: Record<string, unknown>) => void | Promise<void>;
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
      if (event.kind === "data") await handlers.onData?.(event.tipo, event.data);
    }
  }
}

/**
 * Handler de la señal fuera de banda del filtro de confidencialidad. El chunk
 * `data-confidencialidad` NO está en la allowlist del transporte público
 * (Tarea 10): se consume acá, server-side, y nunca llega al browser — decirle
 * al atacante qué regla saltó sería confirmarle qué preguntó bien.
 */
function observarSenialConfidencialidad(
  sessionId: string,
): (tipo: string, data: Record<string, unknown>) => Promise<void> {
  return async (tipo, data) => {
    if (tipo !== "data-confidencialidad") return;
    const reglas = Array.isArray(data.reglas)
      ? data.reglas.filter((r): r is string => typeof r === "string")
      : [];
    if (reglas.length === 0) return;
    try {
      await registrarIntentoExtraccion({ sessionId, reglas });
    } catch (error) {
      // La persistencia nunca rompe el stream del usuario.
      logger.error("registrarIntentoExtraccion failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

/** Runs the receptor turn (readOnly memory), buffering everything. */
async function runReceptor(params: {
  sessionId: string;
  message: string;
  persistirRegistrarCaso?: boolean;
}): Promise<ReceptorOutcome> {
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
          avisarArgsInvalidos(toolName, parsed.error);
          return;
        }
        asignacion = parsed.data;
        return;
      }
      if (toolName === "registrar-caso") {
        // En la corrida de derivación el puntero casoActivoId todavía apunta al
        // Caso viejo: persistir acá escribiría datos del tema NUEVO sobre el
        // caso VIEJO.
        if (params.persistirRegistrarCaso === false) return;
        // The receptor also has registrar-caso available — for out-of-
        // coverage lead capture (spec §3/§7/§10) it may run BEFORE any
        // classification exists. The conversation row already exists (created
        // by getOrCreateConversation earlier in orchestrateChatTurn), so this
        // is safe to persist here even though the rest of this turn is
        // readOnly (final review gap #1 — was silently dropped before).
        const parsed = registrarCasoArgsSchema.safeParse(args);
        if (!parsed.success) {
          avisarArgsInvalidos(toolName, parsed.error);
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
    onData: observarSenialConfidencialidad(params.sessionId),
  });

  if (asignacion) {
    const kind = ESCAPES.has((asignacion as AsignacionArgs).categoria) ? "escape" : "clasificada";
    return { kind, args: asignacion, text };
  }
  return { kind: "pregunta", text };
}

/**
 * Segundo paso del escalamiento (spec §4): el agente de categoría marcó
 * `derivar-tema`, así que el receptor clasifica el MISMO mensaje del usuario y
 * el puntero `casoActivoId` se mueve. El agente marca, el receptor decide: un
 * falso positivo del agente es no-op. Nunca tira — corre con la respuesta del
 * turno ya streameada.
 */
async function derivarTema(params: {
  sessionId: string;
  message: string;
  categoriaActiva: string;
  tema: string;
}): Promise<void> {
  let outcome: ReceptorOutcome;
  try {
    outcome = await runReceptor({
      sessionId: params.sessionId,
      message: params.message,
      persistirRegistrarCaso: false,
    });
  } catch (error: unknown) {
    logger.error("receptor de derivación falló", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  // El texto del receptor se DESCARTA: el cliente ya recibió la respuesta
  // puente del agente y este turno no se appendea al thread.
  if (!outcome.args) return;
  const derivada = outcome.args;
  if (derivada.categoria === params.categoriaActiva) return;
  if (ESCAPES.has(derivada.categoria) || !(await esCategoriaHabilitada(derivada.categoria))) {
    await abrirCasoFueraDeCobertura({
      sessionId: params.sessionId,
      temaDetectado: derivada.temaDetectado ?? derivada.categoria,
      brief: derivada.brief ?? params.tema,
    });
    return;
  }
  const subcategoria = derivada.subcategoria ?? (await subcategoriaUnica(derivada.categoria)) ?? undefined;
  await abrirOReactivarCaso({
    sessionId: params.sessionId,
    categoria: derivada.categoria,
    subcategoria,
    brief: derivada.brief ?? params.tema,
  });
}

/** Streams a category-agent turn to the client while observing case tool-calls. */
function pipeCategoryTurn(params: {
  sessionId: string;
  message: string;
  categoriaActiva: string;
  upstream: Response;
  eventosCompletos: boolean;
}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      function emitir(bytes: Uint8Array): void {
        try {
          controller.enqueue(bytes);
        } catch {
          // Client gone — keep draining so tool-calls still persist.
        }
      }

      let temaDerivado: string | null = null;
      void consumeUpstream(params.upstream, {
        // Allowlist, no denylist: el chat público recibe SOLO el texto y un
        // error genérico. Reenviar el stream crudo publicaba en la pestaña
        // Network los tool-call con toolName y args — o sea multi-agente,
        // recuperación particionada por categoría y captación por tool — sin
        // que el agente dijera una palabra.
        //
        // Con eventosCompletos NO se registran onText/onError: el texto ya
        // viaja dentro del raw y se duplicaría.
        ...(params.eventosCompletos
          ? {
              onRaw: (raw: string) => {
                emitir(encoder.encode(`data: ${raw}\n\n`));
              },
            }
          : {
              onText: (text: string) => {
                emitir(encodeSseText(text));
              },
              onError: () => {
                emitir(encodeSseError());
              },
            }),
        onData: observarSenialConfidencialidad(params.sessionId),
        onToolCall: async (toolName, args) => {
          try {
            if (toolName === "registrar-caso") {
              const parsed = registrarCasoArgsSchema.safeParse(args);
              if (!parsed.success) {
                avisarArgsInvalidos(toolName, parsed.error);
                return;
              }
              await registrarDatosCaso({ sessionId: params.sessionId, ...parsed.data });
            } else if (toolName === "corregir-clasificacion") {
              const parsed = correccionArgsSchema.safeParse(args);
              if (!parsed.success) {
                avisarArgsInvalidos(toolName, parsed.error);
                return;
              }
              const result = await corregirClasificacion({ sessionId: params.sessionId, ...parsed.data });
              if (!result.aplicada) logger.warn("corregir-clasificacion rejected", { toolName });
            } else if (toolName === "derivar-tema") {
              const parsed = derivarTemaArgsSchema.safeParse(args);
              if (!parsed.success) {
                avisarArgsInvalidos(toolName, parsed.error);
                return;
              }
              // Se ANOTA, no se ejecuta: el receptor corre una sola vez por
              // turno y recién con el stream del agente drenado.
              temaDerivado ??= parsed.data.tema;
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
        .then(async () => {
          // Va ANTES de cerrar el controller a propósito: el texto del agente ya
          // salió completo hacia el cliente, y mantener el stream abierto hasta
          // que el puntero se movió es lo único que evita la carrera con el
          // turno siguiente — tanto el chat como el runner de escenarios mandan
          // el próximo mensaje recién cuando este stream cierra.
          if (temaDerivado === null) return;
          await derivarTema({
            sessionId: params.sessionId,
            message: params.message,
            categoriaActiva: params.categoriaActiva,
            tema: temaDerivado,
          });
        })
        .catch((error: unknown) => {
          logger.error("derivación de tema falló", {
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
  eventosCompletos: boolean;
  /** Hecho de la base, no heurística: el Caso activo ya está CAPTADO (spec §5). */
  contactoRegistrado: boolean;
}): Promise<Response> {
  const threadId = threadIdForSession(params.sessionId);
  // Dos hechos distintos, dos señales. "Ya lo tenemos" sale de la base
  // (`Caso.estado === "CAPTADO"`, incluido el contacto heredado del caso
  // anterior). "Ya lo pedimos y no lo dio" no está en la base — no deja rastro
  // salvo el mensaje del asistente — y se deriva del historial del thread con
  // el mismo scan determinístico de siempre: cuatro iteraciones de prompt
  // mostraron que el agente no asienta su propio estado a tiempo (plan
  // 2026-07-22-feedback-captacion-insistente). Sin este scan, el caso para el
  // que se escribió la variante anti-insistencia —el usuario ignoró el pedido
  // y siguió preguntando— no se activa nunca, porque sin contacto el Caso
  // queda EN_CONVERSACION. Si la lectura falla se asume false: el peor caso es
  // el comportamiento previo, nunca romper el turno.
  const pedidoContactoHecho = params.contactoRegistrado
    ? false
    : await fetchAssistantTexts({ threadId, agentId: params.categoria })
        .then((texts) => texts.some(contienePedidoContacto))
        .catch((error: unknown) => {
          logger.warn("pedido-contacto detection failed; assuming not asked", {
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        });
  const upstream = await streamAgentMessage({
    agentId: params.categoria,
    threadId,
    userId: params.sessionId,
    message: params.message,
    casoBrief: params.casoBrief,
    pedidoContactoHecho,
    contactoRegistrado: params.contactoRegistrado,
    // NOTE: no client signal — upstream consumption is decoupled from aborts.
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`category agent stream responded ${upstream.status}`);
  }
  return pipeCategoryTurn({
    sessionId: params.sessionId,
    message: params.message,
    categoriaActiva: params.categoria,
    upstream,
    eventosCompletos: params.eventosCompletos,
  });
}

/**
 * One chat turn (spec §7): route by the active Caso; without it, run the
 * receptor and either chain to the category agent in the SAME response
 * (fast-path) or emit the receptor's question (slow-path, appended to the
 * thread since the receptor runs readOnly).
 */
export async function orchestrateChatTurn(params: {
  sessionId: string;
  message: string;
  /**
   * Reenvía el stream del agente sin filtrar. Solo para /revision, donde el
   * runner de escenarios lee los tool-call de acá. Default false: si una ruta
   * nueva se olvida de pasarlo, cae del lado seguro.
   */
  eventosCompletos?: boolean;
}): Promise<Response> {
  const eventosCompletos = params.eventosCompletos ?? false;
  await getOrCreateConversation(params.sessionId);

  // El ruteo pasa a ser por el Caso activo: `Conversation.categoria` queda como
  // denormalización, no como estado de ruteo.
  const casoActivo = await resolverCasoActivo(params.sessionId);
  if (casoActivo?.categoria) {
    // Guard against a category that was enabled when persisted but has since
    // been disabled in the registry (final review gap #3, regime path):
    // degrade gracefully instead of calling an agent the backend may no
    // longer serve. The persisted classification is left untouched.
    if (!(await esCategoriaHabilitada(casoActivo.categoria))) {
      logger.warn("persisted category no longer enabled", { categoria: casoActivo.categoria });
      return textOnlyResponse(DEGRADED_CATEGORY_MESSAGE);
    }
    return callCategoryAgent({
      sessionId: params.sessionId,
      categoria: casoActivo.categoria,
      message: params.message,
      eventosCompletos,
      contactoRegistrado: casoActivo.estado === "CAPTADO",
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
          eventosCompletos,
          contactoRegistrado: asignada.casoEstado === "CAPTADO",
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
