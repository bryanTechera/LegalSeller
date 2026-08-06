import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { fallbackLogger } from "../../common/logger.js";
import { generateEmbedding, toVectorLiteral } from "../../config/embedding.js";
import { getPool } from "../../config/storage.js";

/**
 * Minimum cosine similarity for a chunk to be considered relevant, per categoría.
 * Calibrated 2026-08-04 against src/test/retrieval: for each categoría, the
 * threshold is the midpoint between the floor of matched positives and the
 * ceiling of negatives. The old single `MIN_SIMILARITY = 0.3` sat below the
 * scale's floor — an unrelated query still scores ~0.49 — so it never filtered
 * anything.
 *
 * A single global threshold does not work here: the highest negative ceiling
 * (laboral, 0.683) sits just 0.002 below the lowest positive floor (tránsito,
 * 0.685), which would overfit a threshold to 42 golden-set items. The scales
 * differ by categoría by up to a tenth (consumo negatives top out at 0.587,
 * laboral's reach 0.683), so each categoría gets its own midpoint instead.
 *
 * Tránsito's margin (±0.006) is thin because that categoría has only 9
 * documents — it's the first threshold to revisit as the corpus grows.
 */
const MIN_SIMILARITY_POR_CATEGORIA: Record<string, number> = {
  laboral: 0.717,
  familia: 0.678,
  "arrendamiento-desalojo": 0.686,
  "relaciones-consumo": 0.645,
  transito: 0.678,
};

/**
 * Default for a query with no `categoria` filter, or with one not in the map
 * above: the lowest of the five calibrated thresholds (relaciones-consumo),
 * so an uncategorized call stays the most permissive — the alternative is
 * silently dropping results for a partition whose scale hasn't been measured.
 */
const MIN_SIMILARITY_DEFAULT = 0.645;

/** Single entry point for the calibrated threshold — keeps the tool and the eval from drifting apart. */
export function minSimilarityPara(categoria?: string): number {
  if (categoria === undefined) return MIN_SIMILARITY_DEFAULT;
  return MIN_SIMILARITY_POR_CATEGORIA[categoria] ?? MIN_SIMILARITY_DEFAULT;
}

/**
 * Category ids with a calibrated entry in `MIN_SIMILARITY_POR_CATEGORIA`.
 * Exported (narrow — just the ids, not the map) so a test can assert every
 * enabled category from the domain registry has a calibrated threshold,
 * without exposing the threshold values themselves as part of the module's
 * public surface.
 */
export const CATEGORIAS_CALIBRADAS: readonly string[] = Object.keys(MIN_SIMILARITY_POR_CATEGORIA);

/**
 * True when `categoria` was given explicitly but has no calibrated entry, so
 * `minSimilarityPara` is about to silently apply relaciones-consumo's scale
 * to a partition whose noise floor was never measured. `categoria ===
 * undefined` does NOT trip this — it is a *different* anomaly, logged
 * separately in `execute` below: `searchDocumentsTool` is registered on
 * exactly the five categoría agents, and every one of their `conducta-*`
 * rules instructs the model to pass its categoria, so an undefined value in
 * production means the model dropped the filter its own rule mandates, not a
 * legitimate uncategorized call (the only genuinely legitimate undefined
 * calls are eval/test harnesses that construct the tool call by hand). Kept
 * separate from `minSimilarityPara` so that function stays pure and total (no
 * logger dependency, never throws).
 */
export function categoriaSinCalibrar(categoria: string | undefined): categoria is string {
  return categoria !== undefined && !(categoria in MIN_SIMILARITY_POR_CATEGORIA);
}

export const ChunkResultSchema = z.object({
  documentId: z.string().meta({ description: "Id del documento de origen" }),
  documentTitle: z.string().meta({ description: "Título del documento de origen" }),
  section: z.string().nullable().meta({ description: "Sección o artículo dentro del documento, si se conoce" }),
  content: z.string().meta({ description: "Texto del fragmento" }),
  similarity: z.number().meta({ description: "Similitud coseno (0 a 1)" }),
});

export type ChunkResult = z.infer<typeof ChunkResultSchema>;

interface ChunkRow {
  document_id: string;
  document_title: string;
  section: string | null;
  content: string;
  similarity: number;
}

export interface SearchQueryParams {
  vector: string;
  minSimilarity: number;
  limit: number;
  categoria?: string;
  subcategorias?: string[];
}

/** Exported for tests: builds the pgvector search query with optional partition filter. */
export function buildSearchQuery({ vector, minSimilarity, limit, categoria, subcategorias }: SearchQueryParams): {
  sql: string;
  params: unknown[];
} {
  const params: unknown[] = [vector, minSimilarity, limit];
  const conditions: string[] = [`1 - (c."embedding" <=> $1::vector) > $2`];
  if (categoria) {
    params.push(categoria);
    conditions.push(`d."categoria" = $${String(params.length)}`);
  }
  if (subcategorias && subcategorias.length > 0) {
    // Cross-cutting corpus lives at the categoria level (subcategoria NULL) and
    // stays in scope for every subcategoria of that categoria — e.g. Ley 18.091
    // (prescripción) and el proceso laboral (Ley 18.572) aplican tanto a despido
    // como a rubros. Sin el OR IS NULL, un doc transversal nunca matchea el filtro.
    params.push(subcategorias);
    conditions.push(`(d."subcategoria" = ANY($${String(params.length)}) OR d."subcategoria" IS NULL)`);
  }
  const sql = `SELECT c."documentId"  AS document_id,
                d."title"       AS document_title,
                c."section"     AS section,
                c."content"     AS content,
                1 - (c."embedding" <=> $1::vector) AS similarity
           FROM "DocumentChunk" c
           JOIN "Document" d ON d."id" = c."documentId"
          WHERE ${conditions.join(" AND ")}
          ORDER BY c."embedding" <=> $1::vector
          LIMIT $3`;
  return { sql, params };
}

/**
 * Mensajes de cada branch de `execute`, exportados para que el test pueda
 * assertarlos sin duplicar el texto — el vocabulario que ve el modelo vive en
 * un solo lugar.
 */
export const MENSAJE_OK =
  "Fragmentos recuperados, de uso interno. Fundá tu respuesta en este texto e integralo como conocimiento propio: nombrale al usuario la norma tal como aparece en el fragmento, nunca el título del material ni la sección de donde salió.";
export const MENSAJE_EMPTY =
  "Sin fragmentos relevantes para esta consulta. No completes el hueco con contenido propio: decile al usuario que ese punto lo tiene que confirmar un abogado de la red —sin mencionarle búsquedas ni material de respaldo— y seguí con la captación.";
export const MENSAJE_ERROR = "No pude recuperar respaldo normativo en este momento. Pedile al consultante que reintente en unos instantes.";

export const searchDocumentsTool = createTool({
  id: "buscar-documentos",
  description: `Recuperá el respaldo normativo vigente para fundar una respuesta legal.
CUANDO USAR:
- El consultante hace una pregunta que necesita respaldo normativo.
- Necesitás verificar un plazo, un monto, un requisito o una consecuencia antes de afirmarlo.
- Antes de responder cualquier consulta sustantiva sobre contenido legal.`,
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .meta({ description: "Consulta en lenguaje natural sobre la que buscar fragmentos relevantes" }),
    limit: z.number().int().min(1).max(10).default(5).meta({ description: "Cantidad máxima de fragmentos" }),
    categoria: z.string().optional().meta({ description: "Limitar la búsqueda a una categoría (ej. laboral)" }),
    subcategorias: z
      .array(z.string())
      .optional()
      .meta({ description: "Limitar a subcategorías específicas (ej. despido)" }),
  }),
  outputSchema: z.object({
    status: z.enum(["ok", "empty", "error"]),
    chunks: z.array(ChunkResultSchema),
    count: z.number(),
    mensaje: z.string(),
  }),
  execute: async (input, executionContext) => {
    const logger = executionContext.mastra?.getLogger() ?? fallbackLogger;
    try {
      if (input.categoria === undefined) {
        logger.warn(
          "buscar-documentos: llamada sin categoría — el agente no aplicó el filtro que su propia regla de conducta le exige; la búsqueda corrió sin partición sobre todo el corpus, al umbral más permisivo",
          { tool: "buscar-documentos" },
        );
      } else if (categoriaSinCalibrar(input.categoria)) {
        logger.warn("buscar-documentos: categoría sin umbral calibrado, aplicando el default de relaciones-consumo", {
          tool: "buscar-documentos",
          categoria: input.categoria,
        });
      }
      const queryEmbedding = await generateEmbedding(input.query);
      const pool = getPool();
      const { sql, params } = buildSearchQuery({
        vector: toVectorLiteral(queryEmbedding),
        minSimilarity: minSimilarityPara(input.categoria),
        limit: input.limit,
        categoria: input.categoria,
        subcategorias: input.subcategorias,
      });
      const result = await pool.query<ChunkRow>(sql, params);

      const chunks: ChunkResult[] = result.rows.map((row) => ({
        documentId: row.document_id,
        documentTitle: row.document_title,
        section: row.section,
        content: row.content,
        similarity: row.similarity,
      }));

      if (chunks.length === 0) {
        return {
          status: "empty" as const,
          chunks: [],
          count: 0,
          mensaje: MENSAJE_EMPTY,
        };
      }

      return {
        status: "ok" as const,
        chunks,
        count: chunks.length,
        mensaje: MENSAJE_OK,
      };
    } catch (error) {
      logger.error("buscar-documentos failed", {
        tool: "buscar-documentos",
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "error" as const,
        chunks: [],
        count: 0,
        mensaje: MENSAJE_ERROR,
      };
    }
  },
});
