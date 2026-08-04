import "server-only";

import { z } from "zod";

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

  const turnoDe = (parentSpanId: string | null): SpanLigero | null => {
    let actual = parentSpanId === null ? undefined : porSpanId.get(parentSpanId);
    for (let salto = 0; actual && salto < MAX_SALTOS; salto++) {
      if (actual.spanType === "agent_run") return actual;
      actual = actual.parentSpanId === null ? undefined : porSpanId.get(actual.parentSpanId);
    }
    return null;
  };

  const respuestaDe = (turno: SpanLigero | null): string | null => {
    if (!turno) return null;
    const desde = turno.startedAt.getTime();
    const hasta = turno.endedAt ? turno.endedAt.getTime() : Number.POSITIVE_INFINITY;
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
