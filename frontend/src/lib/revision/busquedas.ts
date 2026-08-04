import "server-only";

import { z } from "zod";

import { prisma } from "../prisma";
import type { BusquedaCorpus, EstadoBusqueda, FragmentoRecuperado } from "./fuentes";

/** Span del thread sin payload: alcanza para armar el árbol y las ventanas. */
export interface SpanLigero {
  spanId: string;
  parentSpanId: string | null;
  spanType: string;
  entityName: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

/** Span de una llamada a `buscar-documentos`, con su payload. */
export interface SpanBusqueda {
  spanId: string;
  parentSpanId: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: Date;
}

export interface MensajeAsistente {
  id: string;
  createdAt: Date;
}

/** Mismo tope que usa `resolverAgente` en timeline.ts: corta ciclos y árboles raros. */
const MAX_SALTOS = 20;

const entradaSchema = z.object({
  query: z.string(),
  categoria: z.string().nullish(),
  subcategorias: z.array(z.string()).nullish(),
});

const fragmentoSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  section: z.string().nullish(),
  content: z.string(),
  similarity: z.number(),
});

const salidaSchema = z.object({
  status: z.enum(["ok", "empty", "error"]),
  chunks: z.array(fragmentoSchema).nullish(),
});

/** `input`/`output` pueden llegar como jsonb ya parseado o como string. */
function comoValor(crudo: unknown): unknown {
  if (typeof crudo !== "string") return crudo;
  try {
    return JSON.parse(crudo) as unknown;
  } catch {
    return crudo;
  }
}

interface Entrada {
  consulta: string;
  categoria: string | null;
  subcategorias: string[];
  legible: boolean;
}

function leerEntrada(crudo: unknown): Entrada {
  const parseada = entradaSchema.safeParse(comoValor(crudo));
  if (!parseada.success) return { consulta: "", categoria: null, subcategorias: [], legible: false };
  return {
    consulta: parseada.data.query,
    categoria: parseada.data.categoria ?? null,
    subcategorias: parseada.data.subcategorias ?? [],
    legible: true,
  };
}

function leerSalida(crudo: unknown): { estado: EstadoBusqueda; fragmentos: FragmentoRecuperado[] } {
  const parseada = salidaSchema.safeParse(comoValor(crudo));
  if (!parseada.success) return { estado: "ilegible", fragmentos: [] };
  const fragmentos = (parseada.data.chunks ?? [])
    .map((chunk) => ({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      section: chunk.section ?? null,
      content: chunk.content,
      similarity: chunk.similarity,
    }))
    .sort((a, b) => b.similarity - a.similarity);
  return { estado: parseada.data.status, fragmentos };
}

/**
 * Ata cada búsqueda a la respuesta que produjo.
 *
 * NO se puede agrupar por orden cronológico: el mensaje `assistant` se
 * persiste ANTES que las tool calls de su propio turno (verificado en
 * producción el 2026-08-04: mensaje 04:02:00.970, búsqueda 04:02:01.345).
 * Ordenar por reloj le asigna a cada respuesta las búsquedas de la anterior.
 * La atribución correcta sube por `parentSpanId` hasta el `agent_run` y usa
 * su ventana [startedAt, endedAt], que contiene tanto sus tool calls como el
 * mensaje del turno.
 */
export function agruparBusquedas(datos: {
  busquedas: SpanBusqueda[];
  spans: SpanLigero[];
  mensajes: MensajeAsistente[];
}): BusquedaCorpus[] {
  const porSpanId = new Map(datos.spans.map((span) => [span.spanId, span]));

  // Agent_run ordenados por inicio: sirven para cerrar la ventana de un turno
  // sin endedAt (proceso caído, timeout del gateway) en el arranque del
  // siguiente turno del thread, en vez de dejarla abierta hasta +Infinity.
  // Un turno vivo de verdad (el último, sin sucesor) sigue abierto.
  const agentRunsOrdenados = datos.spans
    .filter((span) => span.spanType === "agent_run")
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const turnoDe = (parentSpanId: string | null): SpanLigero | null => {
    let actual = parentSpanId === null ? undefined : porSpanId.get(parentSpanId);
    for (let salto = 0; actual && salto < MAX_SALTOS; salto++) {
      if (actual.spanType === "agent_run") return actual;
      actual = actual.parentSpanId === null ? undefined : porSpanId.get(actual.parentSpanId);
    }
    return null;
  };

  const finDeVentana = (turno: SpanLigero): number => {
    if (turno.endedAt) return turno.endedAt.getTime();
    const desde = turno.startedAt.getTime();
    const siguiente = agentRunsOrdenados.find((run) => run.startedAt.getTime() > desde);
    return siguiente ? siguiente.startedAt.getTime() : Number.POSITIVE_INFINITY;
  };

  const respuestaDe = (turno: SpanLigero | null): string | null => {
    if (!turno) return null;
    const desde = turno.startedAt.getTime();
    const hasta = finDeVentana(turno);
    let elegido: MensajeAsistente | null = null;
    for (const mensaje of datos.mensajes) {
      const cuando = mensaje.createdAt.getTime();
      if (cuando < desde || cuando > hasta) continue;
      if (elegido === null || cuando >= elegido.createdAt.getTime()) elegido = mensaje;
    }
    return elegido === null ? null : elegido.id;
  };

  return datos.busquedas
    .map((span) => {
      const turno = turnoDe(span.parentSpanId);
      const entrada = leerEntrada(span.input);
      const salida = span.error === null || span.error === undefined
        ? leerSalida(span.output)
        : { estado: "error" as const, fragmentos: [] };
      return {
        spanId: span.spanId,
        messageId: respuestaDe(turno),
        agente: turno?.entityName ?? null,
        consulta: entrada.consulta,
        categoria: entrada.categoria,
        subcategorias: entrada.subcategorias,
        estado: entrada.legible ? salida.estado : ("ilegible" as EstadoBusqueda),
        fragmentos: salida.fragmentos,
        fecha: span.startedAt.toISOString(),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const filaSpanLigeroSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  spanType: z.string(),
  entityName: z.string().nullable(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
});

const filaSpanBusquedaSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.unknown(),
  startedAt: z.date(),
});

const filaMensajeAsistenteSchema = z.object({ id: z.string(), createdAt: z.date() });

/**
 * Búsquedas al corpus de un thread, atadas a la respuesta que produjeron.
 *
 * Tres lecturas y no una: el árbol de spans se lee SIN payload porque un
 * thread tiene cientos de spans `model_chunk` cuyo input/output no se usa acá
 * y pesan de más; solo las filas de `buscar-documentos` traen payload.
 */
export async function construirBusquedas(threadId: string): Promise<BusquedaCorpus[]> {
  const [filasSpans, filasBusquedas, filasMensajes] = await Promise.all([
    prisma.$queryRaw`
      SELECT "spanId", "parentSpanId", "spanType", "entityName", "startedAt", "endedAt"
      FROM mastra.mastra_ai_spans
      WHERE "threadId" = ${threadId}`,
    prisma.$queryRaw`
      SELECT "spanId", "parentSpanId", input, output, error, "startedAt"
      FROM mastra.mastra_ai_spans
      WHERE "threadId" = ${threadId}
        AND "spanType" = 'tool_call'
        AND (COALESCE("entityName", name) LIKE '%buscar-documentos%')
      ORDER BY "startedAt" ASC`,
    prisma.$queryRaw`
      SELECT id, "createdAt"
      FROM mastra.mastra_messages
      WHERE thread_id = ${threadId} AND role = 'assistant'
      ORDER BY "createdAt" ASC`,
  ]);

  return agruparBusquedas({
    spans: filaSpanLigeroSchema.array().parse(filasSpans),
    busquedas: filaSpanBusquedaSchema.array().parse(filasBusquedas),
    mensajes: filaMensajeAsistenteSchema.array().parse(filasMensajes),
  });
}
