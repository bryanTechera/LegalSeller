import "server-only";

import { z } from "zod";

import { prisma } from "../prisma";

const filaMensajeSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.unknown(),
  createdAt: z.date(),
});

const filaSpanSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  spanType: z.string(),
  name: z.string(),
  entityName: z.string().nullable(),
  parentEntityName: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.unknown(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  attributes: z.unknown(),
});

const atributosGeneracionSchema = z
  .object({
    model: z.string().optional(),
    usage: z
      .object({
        inputTokens: z.coerce.number().optional(),
        outputTokens: z.coerce.number().optional(),
      })
      .optional(),
  })
  .nullable();

export interface MensajeTimeline {
  tipo: "mensaje";
  id: string;
  rol: "user" | "assistant";
  texto: string;
  fecha: string;
}
export interface ToolCallTimeline {
  tipo: "tool-call";
  spanId: string;
  tool: string;
  agente: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  fecha: string;
}
export interface AgenteTimeline {
  tipo: "turno-agente";
  spanId: string;
  agente: string;
  fecha: string;
}
export interface GeneracionTimeline {
  tipo: "generacion";
  spanId: string;
  modelo: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  fecha: string;
}
export type ItemTimeline = MensajeTimeline | ToolCallTimeline | AgenteTimeline | GeneracionTimeline;

/**
 * Extrae el texto visible de un content de mastra_messages. Formatos vistos
 * en producción: string plano, string JSON serializado, y el formato v2
 * { format: 2, parts: [{ type: "text", text }] }. Shapes desconocidos → "".
 */
export function extraerTexto(content: unknown): string {
  if (typeof content === "string") {
    try {
      const parsed: unknown = JSON.parse(content);
      // Solo recursar en estructuras (o string anidado): un literal JSON puro
      // ("45000", "true") ES el texto del mensaje, no un envoltorio.
      if ((typeof parsed === "object" && parsed !== null) || typeof parsed === "string") {
        return extraerTexto(parsed);
      }
    } catch {
      // no era JSON — texto plano
    }
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(extraerTexto).filter(Boolean).join("\n");
  }
  if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    if (obj.format === 2 && Array.isArray(obj.parts)) {
      return (obj.parts as unknown[])
        .map((part) => {
          if (typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text") {
            const text = (part as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join("");
    }
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }
  return "";
}

/**
 * Timeline unificada de una sesión: mensajes de mastra_messages intercalados
 * (por fecha) con los spans de mastra_ai_spans (tool calls con input/output,
 * turno de agente, generaciones con tokens). Lectura read-only del schema
 * `mastra` — un solo code path para el BFF (sin spans) y los scripts (con
 * spans). Las notas se insertan en la UI/export por messageId, no acá.
 */
export async function construirTimeline(
  threadId: string,
  opciones?: { conSpans?: boolean },
): Promise<ItemTimeline[]> {
  const filasMensajes = filaMensajeSchema.array().parse(
    await prisma.$queryRaw`
      SELECT id, role, content, "createdAt"
      FROM mastra.mastra_messages
      WHERE thread_id = ${threadId}
      ORDER BY "createdAt" ASC`,
  );

  const items: ItemTimeline[] = [];
  for (const fila of filasMensajes) {
    if (fila.role !== "user" && fila.role !== "assistant") continue;
    const texto = extraerTexto(fila.content);
    if (!texto.trim()) continue;
    items.push({ tipo: "mensaje", id: fila.id, rol: fila.role, texto, fecha: fila.createdAt.toISOString() });
  }

  if (opciones?.conSpans) {
    const filasSpans = filaSpanSchema.array().parse(
      await prisma.$queryRaw`
        SELECT "spanId", "parentSpanId", "spanType", name, "entityName", "parentEntityName",
               input, output, error, "startedAt", "endedAt", attributes
        FROM mastra.mastra_ai_spans
        WHERE "threadId" = ${threadId}
          AND "spanType" IN ('agent_run', 'tool_call', 'model_generation')
        ORDER BY "startedAt" ASC`,
    );
    for (const span of filasSpans) {
      const fecha = span.startedAt.toISOString();
      if (span.spanType === "tool_call") {
        items.push({
          tipo: "tool-call",
          spanId: span.spanId,
          tool: span.entityName ?? span.name,
          agente: span.parentEntityName,
          input: span.input,
          output: span.output,
          error: span.error,
          fecha,
        });
      } else if (span.spanType === "agent_run") {
        items.push({ tipo: "turno-agente", spanId: span.spanId, agente: span.entityName ?? span.name, fecha });
      } else {
        const atributos = atributosGeneracionSchema.catch(null).parse(span.attributes);
        items.push({
          tipo: "generacion",
          spanId: span.spanId,
          modelo: atributos?.model ?? null,
          tokensEntrada: atributos?.usage?.inputTokens ?? 0,
          tokensSalida: atributos?.usage?.outputTokens ?? 0,
          fecha,
        });
      }
    }
  }

  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
