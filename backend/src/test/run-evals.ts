/**
 * Programmatic tool-call evals. Gate: every dataset's precision >= THRESHOLD
 * or exit 1. Uses generate() without memory: each item is an isolated first
 * message.
 *
 * Datasets:
 * - Receptor classification (spec §9): golden set → asignar-clasificacion
 *   matcher. Extended 2026-07-22 with familia items (second enabled
 *   category, procesamiento familia).
 * - Citación por agente de categoría (laboral 2026-07-19, familia
 *   2026-07-22): substantive questions must trigger buscar-documentos
 *   before answering — the tool-level half of "SIEMPRE fundar en el corpus".
 * - Voz-fuentes por agente de categoría (revisión feedback legal
 *   2026-07-22): responses must not surface internal corpus mechanics
 *   (document titles, "documento", "corpus", "PDF") and, when asked about
 *   sources, must answer with the official Jurco phrase (rules conducta-*).
 * - Captación por agente de categoría (feedback legal 2026-07-22, corrida
 *   divorcio-con-hijos-visitas): multi-turn — after an ignored contact ask,
 *   the agent must NOT repeat the request on its own initiative (rule
 *   captacion-caso: pedido una sola vez; ignorado = "todavía no").
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RequestContext } from "@mastra/core/request-context";

import { familiaAgent } from "../mastra/dominios/familia/index.js";
import { laboralAgent } from "../mastra/dominios/laboral/index.js";
import { recepcionAgent } from "../mastra/dominios/recepcion/index.js";

const THRESHOLD = 0.9;

interface EvalItem {
  mensaje: string;
  esperado: { categoria?: string; subcategoria?: string; casoSensible?: boolean; pregunta?: boolean };
}

interface CitacionItem {
  mensaje: string;
  esperado: { toolCall: string };
}

interface VozFuentesItem {
  mensaje: string;
  esperado: { sinReferenciasInternas?: boolean; contiene?: string[] };
}

interface CaptacionItem {
  mensajes: { rol: "usuario" | "asistente"; texto: string }[];
  esperado: { sinNuevoPedidoContacto: boolean };
}

/**
 * Contact-ask phrasings observed in real runs ("dejame un teléfono o un
 * correo", "pasame tu nombre y un teléfono", "¿te gustaría dejarme un
 * teléfono?", "¿me dejás un contacto?"). Used to detect a REPEATED ask after
 * the user ignored the first one.
 */
const PEDIDO_CONTACTO: readonly RegExp[] = [
  /(dejame|dejarme|dej[aá]s|pasame|pasarme|pas[aá]s|compartime|compartirme|facilitame|brindame|dame).{0,60}(tel[eé]fono|celular|correo|mail|contacto)/i,
  /(tus datos|un dato) de contacto/i,
];

/**
 * Internal-mechanics leak patterns (feedback legal 2026-07-22, notas de
 * Federico): the agent must integrate corpus content as its own knowledge —
 * naming document titles ("Despido — …"), "el documento", "corpus" or "PDF"
 * breaks the product voice. "un/algún documento" stays legal (the agent may
 * legitimately ask the consultante for their paperwork).
 */
const REFERENCIAS_INTERNAS: readonly RegExp[] = [
  /\bcorpus\b/i,
  /base de (datos|documentos|conocimiento)/i,
  /\bPDF\b/i,
  /\b(el|del) documento\b/i,
  /(Despido|Rubros laborales|Laboral|Familia) —/,
];

interface ToolCallInfo {
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Tolerant tool-call extraction (same fallback style as the SSE parser,
 * frontend/src/utils/sse.ts): the installed @mastra/core returns
 * `generate()`'s `toolCalls` as `ToolCallChunk[]` — `{ type: "tool-call",
 * payload: { toolName, args } }` — not the flat `{ toolName, args }` shape.
 * Accept both so a future @mastra/core bump degrades gracefully instead of
 * silently reading `undefined`.
 */
function extractToolCalls(result: unknown): ToolCallInfo[] {
  const value = result as { toolCalls?: unknown };
  const rawCalls = Array.isArray(value.toolCalls) ? value.toolCalls : [];
  return rawCalls.flatMap((call) => {
    const record = call as Record<string, unknown>;
    const nested = (record.payload && typeof record.payload === "object" ? record.payload : {}) as Record<
      string,
      unknown
    >;
    const toolName = nested.toolName ?? record.toolName;
    const rawArgs = nested.args ?? record.args ?? nested.input ?? record.input;
    if (typeof toolName !== "string" || toolName.length === 0) return [];
    const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
    return [{ toolName, args }];
  });
}

/**
 * `requestContext` on `generate()` is an actual `RequestContext` instance
 * (not a plain object — that's only accepted at the HTTP layer, which wraps
 * it server-side). `getReadOnlyFromContext` reads it with `.get("readOnly")`.
 */
function buildEvalRequestContext(): RequestContext {
  return new RequestContext([["readOnly", { userId: "eval" }]]);
}

async function evalReceptorClasificacion(): Promise<number> {
  const datasetPath = join(dirname(fileURLToPath(import.meta.url)), "agents/recepcion/datasets/clasificacion.json");
  const items = JSON.parse(readFileSync(datasetPath, "utf8")) as EvalItem[];

  let passed = 0;
  const failures: string[] = [];

  for (const item of items) {
    const result = await recepcionAgent.generate(item.mensaje, {
      requestContext: buildEvalRequestContext(),
    });
    const asignacion = extractToolCalls(result).find((c) => c.toolName === "asignar-clasificacion");
    const args = asignacion?.args;

    let ok = false;
    if (item.esperado.pregunta) {
      ok = asignacion === undefined; // must ask, not classify
    } else if (item.esperado.casoSensible) {
      ok = args?.casoSensible === true;
    } else {
      // A consulta laboral that merely references already-denounced violence
      // (medidas cautelares dispuestas, no current risk) must NOT be short-
      // circuited as caso sensible — legal team's answer to Q5 (despido
      // 2026-07-19). When esperado.casoSensible is false we also assert the
      // receptor did not flag it, which the categoria check alone would miss.
      const sensibleOk = item.esperado.casoSensible === false ? args?.casoSensible !== true : true;
      ok =
        args?.categoria === item.esperado.categoria &&
        (item.esperado.subcategoria === undefined || args?.subcategoria === item.esperado.subcategoria) &&
        sensibleOk;
    }

    if (ok) passed += 1;
    else failures.push(`"${item.mensaje}" → esperado ${JSON.stringify(item.esperado)}, obtuvo ${JSON.stringify(args ?? "sin tool-call")}`);
  }

  const precision = passed / items.length;
  console.log(
    `Receptor classification: ${String(passed)}/${String(items.length)} (${(precision * 100).toFixed(0)}%) — threshold ${String(THRESHOLD * 100)}%`,
  );
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  return precision;
}

type CategoriaAgent = typeof laboralAgent;

async function evalCitacion(agent: CategoriaAgent, agentDir: string, label: string): Promise<number> {
  const datasetPath = join(dirname(fileURLToPath(import.meta.url)), `agents/${agentDir}/datasets/citacion.json`);
  const items = JSON.parse(readFileSync(datasetPath, "utf8")) as CitacionItem[];

  let passed = 0;
  const failures: string[] = [];

  for (const item of items) {
    const result = await agent.generate(item.mensaje, {
      requestContext: buildEvalRequestContext(),
    });
    const calls = extractToolCalls(result);
    const ok = calls.some((c) => c.toolName === item.esperado.toolCall);

    if (ok) passed += 1;
    else
      failures.push(
        `"${item.mensaje}" → esperado tool-call ${item.esperado.toolCall}, obtuvo [${calls.map((c) => c.toolName).join(", ")}]`,
      );
  }

  const precision = passed / items.length;
  console.log(
    `${label} citación (buscar-documentos): ${String(passed)}/${String(items.length)} (${(precision * 100).toFixed(0)}%) — threshold ${String(THRESHOLD * 100)}%`,
  );
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  return precision;
}

async function evalVozFuentes(agent: CategoriaAgent, agentDir: string, label: string): Promise<number> {
  const datasetPath = join(dirname(fileURLToPath(import.meta.url)), `agents/${agentDir}/datasets/voz-fuentes.json`);
  const items = JSON.parse(readFileSync(datasetPath, "utf8")) as VozFuentesItem[];

  let passed = 0;
  const failures: string[] = [];

  for (const item of items) {
    const result = await agent.generate(item.mensaje, {
      requestContext: buildEvalRequestContext(),
    });
    const rawText = (result as { text?: unknown }).text;
    const text = typeof rawText === "string" ? rawText : "";

    const problemas: string[] = [];
    if (item.esperado.sinReferenciasInternas) {
      for (const patron of REFERENCIAS_INTERNAS) {
        const match = patron.exec(text);
        if (match) problemas.push(`referencia interna "${match[0]}"`);
      }
    }
    for (const requerido of item.esperado.contiene ?? []) {
      if (!text.toLowerCase().includes(requerido.toLowerCase())) problemas.push(`falta "${requerido}"`);
    }

    if (text.length > 0 && problemas.length === 0) passed += 1;
    else failures.push(`"${item.mensaje}" → ${text.length === 0 ? "respuesta vacía" : problemas.join("; ")}`);
  }

  const precision = passed / items.length;
  console.log(
    `${label} voz-fuentes (sin mecánica interna): ${String(passed)}/${String(items.length)} (${(precision * 100).toFixed(0)}%) — threshold ${String(THRESHOLD * 100)}%`,
  );
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  return precision;
}

async function evalCaptacion(agent: CategoriaAgent, agentDir: string, label: string): Promise<number> {
  const datasetPath = join(dirname(fileURLToPath(import.meta.url)), `agents/${agentDir}/datasets/captacion.json`);
  const items = JSON.parse(readFileSync(datasetPath, "utf8")) as CaptacionItem[];

  let passed = 0;
  const failures: string[] = [];

  for (const item of items) {
    const messages = item.mensajes.map((mensaje) => ({
      role: mensaje.rol === "usuario" ? ("user" as const) : ("assistant" as const),
      content: mensaje.texto,
    }));
    const result = await agent.generate(messages, {
      requestContext: buildEvalRequestContext(),
    });
    const rawText = (result as { text?: unknown }).text;
    const text = typeof rawText === "string" ? rawText : "";

    const pedido = PEDIDO_CONTACTO.map((patron) => patron.exec(text)).find((match) => match !== null);
    const ok = text.length > 0 && (!item.esperado.sinNuevoPedidoContacto || pedido === undefined);

    if (ok) passed += 1;
    else {
      const ultimo = item.mensajes.at(-1)?.texto ?? "";
      failures.push(`"${ultimo}" → ${text.length === 0 ? "respuesta vacía" : `re-pidió contacto: "${pedido?.[0] ?? ""}"`}`);
    }
  }

  const precision = passed / items.length;
  console.log(
    `${label} captación (sin insistencia de contacto): ${String(passed)}/${String(items.length)} (${(precision * 100).toFixed(0)}%) — threshold ${String(THRESHOLD * 100)}%`,
  );
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  return precision;
}

const EVALS: readonly { nombre: string; run: () => Promise<number> }[] = [
  { nombre: "receptor", run: evalReceptorClasificacion },
  { nombre: "laboral-citacion", run: () => evalCitacion(laboralAgent, "laboral", "Laboral") },
  { nombre: "laboral-voz-fuentes", run: () => evalVozFuentes(laboralAgent, "laboral", "Laboral") },
  { nombre: "laboral-captacion", run: () => evalCaptacion(laboralAgent, "laboral", "Laboral") },
  { nombre: "familia-citacion", run: () => evalCitacion(familiaAgent, "familia", "Familia") },
  { nombre: "familia-voz-fuentes", run: () => evalVozFuentes(familiaAgent, "familia", "Familia") },
  { nombre: "familia-captacion", run: () => evalCaptacion(familiaAgent, "familia", "Familia") },
];

/** `pnpm evals [filtro]` — sin filtro corre todo; con filtro, los datasets cuyo nombre lo contenga. */
async function main(): Promise<number> {
  // .at() (a diferencia del índice directo) tipa el undefined del fuera-de-rango.
  const filtro = process.argv.at(2);
  const seleccion = filtro === undefined ? EVALS : EVALS.filter((evalDef) => evalDef.nombre.includes(filtro));
  if (seleccion.length === 0) {
    console.error(
      `Ningún dataset matchea "${filtro ?? ""}". Disponibles: ${EVALS.map((evalDef) => evalDef.nombre).join(", ")}`,
    );
    return 1;
  }
  const resultados: number[] = [];
  for (const evalDef of seleccion) resultados.push(await evalDef.run());
  return resultados.every((precision) => precision >= THRESHOLD) ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("Eval runner crashed", error);
    process.exitCode = 1;
  });
