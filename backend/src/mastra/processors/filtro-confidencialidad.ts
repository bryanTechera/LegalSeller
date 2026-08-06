import type {
  Processor,
  ProcessOutputResultArgs,
  ProcessOutputStreamArgs,
} from "@mastra/core/processors";
import type { ChunkType } from "@mastra/core/stream";

import { detectar, normalizarParaMatch, RETENCION_CHARS } from "./terminos-confidenciales.js";

/**
 * Clave interna del runner de Mastra para que un processor emita DOS partes
 * desde una sola llamada (`processOutputStream` solo puede devolver una). No
 * está en el barrel público de @mastra/core/processors, así que va hardcodeada
 * con un test que rompe si un bump de versión la cambia. `PIIDetector` y
 * `BatchPartsProcessor` la usan igual.
 */
export const REPROCESS_PART_KEY = "__mastraReprocessPart";

export const TIPO_SENIAL = "data-confidencialidad";

/**
 * Reemplazo único para TODA regla. Que sea siempre el mismo es parte de la
 * defensa: con un reemplazo distinto por familia, la posición del tachón le
 * confirma al atacante cuál de las opciones que ofreció era la verdadera.
 */
const REEMPLAZO = "eso queda fuera de lo que puedo conversar";

/** Límites de oración: se redacta el segmento portador, no el token. */
function limitesDeSegmento(texto: string, inicio: number, fin: number): [number, number] {
  const antes = texto.slice(0, inicio);
  const desde = Math.max(antes.lastIndexOf("."), antes.lastIndexOf("\n"), antes.lastIndexOf("—")) + 1;
  const resto = texto.slice(fin);
  const corte = resto.search(/[.\n]/);
  return [desde, corte === -1 ? texto.length : fin + corte + 1];
}

export function redactarTexto(texto: string): { texto: string; reglas: string[] } {
  const detecciones = detectar(texto);

  // La normalización colapsa separadores ("O-p-e-n-A-I" → "OpenAI"), así que
  // SUS índices no sirven contra el texto original. Se usa solo como detector
  // binario: si la versión normalizada revela algo que la original no, se
  // redacta el texto entero. Es conservador y rarísimo (solo salida deletreada).
  const normalizado = normalizarParaMatch(texto);
  const soloEnNormalizado = normalizado === texto ? [] : detectar(normalizado);
  if (detecciones.length === 0 && soloEnNormalizado.length > 0) {
    return { texto: REEMPLAZO, reglas: [...new Set(soloEnNormalizado.map((d) => d.id))] };
  }

  if (detecciones.length === 0) return { texto, reglas: [] };

  const reglas = [...new Set([...detecciones, ...soloEnNormalizado].map((d) => d.id))];
  // Fusionar segmentos solapados de atrás hacia adelante para no correr índices.
  const segmentos = detecciones
    .map((d) => limitesDeSegmento(texto, d.inicio, d.fin))
    .sort((a, b) => b[0] - a[0]);
  let salida = texto;
  let ultimoInicio = Number.POSITIVE_INFINITY;
  for (const [desde, hasta] of segmentos) {
    if (hasta > ultimoInicio) continue;
    salida = `${salida.slice(0, desde)} ${REEMPLAZO}. ${salida.slice(hasta)}`;
    ultimoInicio = desde;
  }
  return { texto: salida.replace(/\s+/g, " ").trim(), reglas };
}

interface EstadoFiltro {
  spanId?: string;
  cola: string;
  reglas: Set<string>;
}

function estadoDe(state: Record<string, unknown>): EstadoFiltro {
  const actual = state.filtroConfidencialidad as EstadoFiltro | undefined;
  if (actual) return actual;
  const nuevo: EstadoFiltro = { cola: "", reglas: new Set() };
  state.filtroConfidencialidad = nuevo;
  return nuevo;
}

/** Lee el `id` del payload de un chunk de texto sin romper el narrowing. */
function idDePayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const { id } = payload as { id?: unknown };
  return typeof id === "string" ? id : undefined;
}

/**
 * Backstop determinístico ante el red-team del equipo legal (2026-08-05).
 * NO usa `RegexFilterProcessor` porque su `processOutputStream` matchea sobre
 * un `text-delta` suelto: una frase partida entre dos tokens se le escapa.
 * Plan: docs/plans/2026-08-05-seguridad-antifiltracion.md §4.3
 */
export class FiltroConfidencialidad implements Processor<"filtro-confidencialidad"> {
  readonly id = "filtro-confidencialidad" as const;
  readonly name = "Filtro de confidencialidad";

  async processOutputStream(args: ProcessOutputStreamArgs): Promise<ChunkType | null | undefined> {
    const { part, state } = args;
    const estado = estadoDe(state);

    // El Map de processorStates se comparte entre los pasos de maxSteps: sin
    // este reset, la cola de un paso sale pegada al primer delta del siguiente.
    if (part.type === "text-start") {
      estado.spanId = idDePayload(part.payload);
      estado.cola = "";
      return part;
    }

    if (part.type === "text-delta") {
      const acumulado = estado.cola + part.payload.text;
      const emitible = acumulado.slice(0, Math.max(0, acumulado.length - RETENCION_CHARS));
      estado.cola = acumulado.slice(emitible.length);
      if (emitible.length === 0) return null;
      const { texto, reglas } = redactarTexto(emitible);
      for (const regla of reglas) estado.reglas.add(regla);
      return { ...part, payload: { ...part.payload, text: texto } };
    }

    // El `finish` de un paso intermedio NO pasa por el processor: el flush va acá.
    if (part.type === "text-end") {
      const { texto, reglas } = redactarTexto(estado.cola);
      for (const regla of reglas) estado.reglas.add(regla);
      estado.cola = "";
      if (estado.reglas.size > 0) {
        await args.writer?.custom({ type: TIPO_SENIAL, data: { reglas: [...estado.reglas] } });
      }
      if (texto.length === 0) return part;
      // Dos partes desde una llamada: el delta final se emite ahora y el
      // `text-end` original se stashea para que el runner lo re-drivee.
      state[REPROCESS_PART_KEY] = part;
      return {
        type: "text-delta",
        payload: { id: estado.spanId ?? "", text: texto, providerMetadata: undefined },
      } as ChunkType;
    }

    return part;
  }

  processOutputResult(args: ProcessOutputResultArgs): ProcessOutputResultArgs["messages"] {
    // Red de seguridad sobre lo que se PERSISTE: si el buffer deslizante dejó
    // pasar algo por el stream, al menos no queda escrito en mastra_messages y
    // no vuelve al modelo en el turno siguiente para que lo reformule.
    return args.messages.map((mensaje) => {
      const parts = mensaje.content.parts.map((part) =>
        part.type === "text" && typeof part.text === "string"
          ? { ...part, text: redactarTexto(part.text).texto }
          : part,
      );
      // `content.content` es el espejo string del mismo texto y se persiste
      // igual: redactar solo las parts dejaría la fuga escrita en el espejo.
      const espejo =
        typeof mensaje.content.content === "string"
          ? redactarTexto(mensaje.content.content).texto
          : mensaje.content.content;
      return { ...mensaje, content: { ...mensaje.content, parts, content: espejo } };
    });
  }
}
