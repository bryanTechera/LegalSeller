import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  throw new Error(
    "GOOGLE_GENERATIVE_AI_API_KEY is not set. It is required for embeddings (gemini-embedding-001).",
  );
}

const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Vector dimension for pgvector columns. Single source of truth: the
 * DocumentChunk.embedding column in the frontend Prisma schema must match.
 */
export const EMBEDDING_DIMENSION = 3072;

const client = new GoogleGenAI({ apiKey });

/**
 * Single entrypoint for embeddings. Nothing else calls the embeddings API.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
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
