import { MODELO_ESPECIALISTA, MODELO_RECEPCION } from "../config/modelos.js";

export interface ReglaConfidencial {
  /** Viaja en la señal hacia el board. NUNCA viaja el texto redactado. */
  id: string;
  patron: RegExp;
}

export interface Deteccion {
  id: string;
  inicio: number;
  fin: number;
}

/** Palabra completa, case-insensitive, escapando los metacaracteres del término. */
function palabra(...terminos: string[]): RegExp {
  const alternativa = terminos.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`\\b(?:${alternativa})\\b`, "gi");
}

/** Ids de modelo declarados en config/modelos.ts, más sus fragmentos. */
const MODELOS_DECLARADOS = [MODELO_RECEPCION, MODELO_ESPECIALISTA].flatMap((id) => [
  id,
  id.split("/")[1] ?? id,
]);

export const REGLAS_CONFIDENCIALES: readonly ReglaConfidencial[] = [
  { id: "proyecto", patron: palabra("LegalSeller", "legalseller-backend", "legalseller-storage") },
  { id: "modelo", patron: palabra(...MODELOS_DECLARADOS, "Luna", "Terra") },
  // La FAMILIA de versiones, no la verdadera: si sólo se tachara la que corre en
  // producción, la posición del tachón la confirmaría (regla de diseño 2). Por
  // eso el rango [2-5] cubre las dos familias del stack y sus hermanas.
  //
  // El número va GATEADO POR CONTEXTO, y eso no es opcional: medido contra el
  // corpus, un `\b[2-5]\.[0-9]\b` pelado da 20 falsos positivos, y 8 de ellos
  // son citas de artículo ("art. 5.3", "arts. 2.3 y 2.4") que las conducta-*
  // le ORDENAN citar al agente. Una versión de modelo y un ordinal de artículo
  // son léxicamente idénticos: lo único que los separa es el vocabulario que
  // los rodea. Con el gate, el corpus da cero.
  {
    id: "modelo-version",
    patron:
      /\b(?:modelo|versi[oó]n|familia|flagship|mini|flash|lite|turbo)\b[^\n]{0,25}\b[2-5]\.[0-9]\b|\b[2-5]\.[0-9]\b[^\n]{0,25}\b(?:modelo|versi[oó]n|familia|flagship|mini|flash|lite|turbo)\b/gi,
  },
  {
    id: "proveedor",
    patron: palabra("OpenAI", "Anthropic", "Claude", "Gemini", "Vertex", "Mistral", "Cohere"),
  },
  // "Llama" va aparte y case-sensitive: con el flag `i` del resto matchea el
  // verbo español ("lo que la ley llama prolongación de la jornada"), medido
  // como falso positivo en el corpus.
  { id: "proveedor-llama", patron: /\bLlama\b/g },
  { id: "framework", patron: palabra("Mastra", "Next.js", "Prisma", "Vercel", "LangChain") },
  {
    id: "infra",
    patron: palabra("pgvector", "embeddings", "embedding", "RAG", "vector store", "chunking", "chunk"),
  },
  {
    id: "arquitectura",
    patron: palabra(
      "agente clasificador",
      "modelo clasificador",
      "multiagente",
      "multi-agente",
      "system prompt",
      "prompt del sistema",
    ),
  },
  {
    id: "parametros",
    patron: palabra(
      "reasoningEffort",
      "thinkingLevel",
      "thinkingBudget",
      "maxSteps",
      "ventana de contexto",
      "context window",
    ),
  },
  {
    id: "negocio",
    patron: palabra(
      "caso captado",
      "captación de leads",
      "lead calificado",
      "costo por token",
      "demanda por categoría",
      "plan mensual",
      "suscripción mensual",
    ),
  },
  // Co-ocurrencia: el término es el CONTADOR, no la norma. El turno 3 del
  // red-team puso seis normas de cuatro categorías en un bloque.
  //
  // El umbral es 4 en una ventana de 60, no 3 en 200: medido contra el corpus,
  // 3-en-200 marca 6 pasajes legítimos —el mapa comparativo de regímenes de
  // arrendamiento cita varias leyes seguidas porque ESE es su contenido— y
  // mutilaría la respuesta que los sintetice. Con 4-en-60 el corpus da cero y
  // el dump del red-team sigue cayendo.
  { id: "enumeracion-normas", patron: /(?:(?:Decreto-?\s?Ley|Ley)\s*N?[°º]?\s*\d{1,2}\.\d{3}\D{0,60}){4,}/gi },
  // Ídem con los nombres de categoría: 4 o más en una ventana es un inventario.
  { id: "enumeracion-categorias", patron: /(?:\b(?:laboral|familia|tr[aá]nsito|arrendamiento|desalojos?|consumo)\b\W{0,40}){4,}/gi },
];

/** El buffer del processor tiene que cubrir el patrón literal más largo. */
export const RETENCION_CHARS = 40;

/**
 * Colapsa separadores intercalados ("O-p-e-n-A-I") para que la salida
 * deletreada no evada el matcher. No toca los espacios entre palabras reales.
 */
export function normalizarParaMatch(texto: string): string {
  return texto.replace(/\b(\w)(?:[-.\s](\w)){2,}\b/g, (match) => match.replace(/[-.\s]/g, ""));
}

export function detectar(texto: string): Deteccion[] {
  const detecciones: Deteccion[] = [];
  for (const regla of REGLAS_CONFIDENCIALES) {
    // Los patrones son `g`: hay que resetear lastIndex entre llamadas.
    regla.patron.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regla.patron.exec(texto)) !== null) {
      detecciones.push({ id: regla.id, inicio: match.index, fin: match.index + match[0].length });
      if (match[0].length === 0) regla.patron.lastIndex += 1;
    }
  }
  return detecciones.sort((a, b) => a.inicio - b.inicio);
}
