import { GoogleGenAI } from "@google/genai";

import { CHUNK_OVERLAP, CHUNK_SIZE } from "../utils/chunking.js";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  throw new Error(
    "GOOGLE_GENERATIVE_AI_API_KEY is not set. It is required for embeddings (gemini-embedding-001).",
  );
}

const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Task type declared to the embeddings API. "NINGUNO" omits `config` entirely,
 * which is the historical behaviour every stored vector was produced with.
 * Changing this constant changes PIPELINE_VERSION, which is what makes
 * `corpus:sync --reembed-stale` re-embed the corpus.
 */
export type EmbeddingTaskType = "NINGUNO" | "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export const EMBEDDING_TASK_TYPE: EmbeddingTaskType = "NINGUNO";

/** Vector dimension for pgvector columns. Must match DocumentChunk.embedding in Prisma. */
export const EMBEDDING_DIMENSION = 3072;

/** Embedding half of the pipeline fingerprint: a change here can be fixed from stored chunk text. */
export const EMBED_FINGERPRINT = `${EMBEDDING_MODEL}|${EMBEDDING_TASK_TYPE}`;

/** Chunking half: a change here requires the source file, since chunk boundaries move. */
export const CHUNK_FINGERPRINT = `${String(CHUNK_SIZE)}:${String(CHUNK_OVERLAP)}`;

/** Stored per Document. Differs from the row's value => its chunks are stale. */
export const PIPELINE_VERSION = `${EMBED_FINGERPRINT}|${CHUNK_FINGERPRINT}`;

const client = new GoogleGenAI({ apiKey });

/**
 * Single entrypoint for embeddings. Nothing else calls the embeddings API.
 * Documents are embedded as RETRIEVAL_DOCUMENT and queries as RETRIEVAL_QUERY
 * once EMBEDDING_TASK_TYPE moves off "NINGUNO".
 */
export async function generateEmbedding(
  text: string,
  taskType: EmbeddingTaskType = EMBEDDING_TASK_TYPE,
): Promise<number[]> {
  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    ...(taskType === "NINGUNO" ? {} : { config: { taskType } }),
  });
  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error("Embedding API returned no values");
  }
  return values;
}

/** Formats a vector as a pgvector literal for parameterized queries. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
