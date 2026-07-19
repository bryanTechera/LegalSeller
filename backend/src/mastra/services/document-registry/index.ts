import { makeLogger } from "../../common/logger.js";
import { EMBEDDING_DIMENSION, generateEmbedding, toVectorLiteral } from "../../config/embedding.js";
import { getPool } from "../../config/storage.js";
import { chunkText } from "../../utils/chunking.js";

const logger = makeLogger("DocumentRegistry");

export interface RegisterDocumentParams {
  /** Id of the Document row (created by the frontend via Prisma). */
  documentId: string;
  /** Full extracted text of the document. */
  text: string;
  /** Optional section label applied to all chunks (e.g. when ingesting per-article). */
  section?: string;
}

export interface RegisterDocumentResult {
  status: "ok" | "error";
  chunksInserted: number;
}

/**
 * RAG ingestion: chunk → embed → insert into pgvector.
 *
 * Embeds chunk by chunk so a single failure doesn't lose the whole document;
 * the operation reports how many chunks landed. Re-running for the same
 * documentId first clears its chunks (idempotent re-ingestion).
 */
export async function registerDocument(params: RegisterDocumentParams): Promise<RegisterDocumentResult> {
  const pool = getPool();
  const chunks = chunkText(params.text);

  if (chunks.length === 0) {
    logger.warn("registerDocument called with empty text", { documentId: params.documentId });
    return { status: "ok", chunksInserted: 0 };
  }

  try {
    await pool.query(`DELETE FROM "DocumentChunk" WHERE "documentId" = $1`, [params.documentId]);

    let inserted = 0;
    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(chunk.content);
        if (embedding.length !== EMBEDDING_DIMENSION) {
          throw new Error(`Unexpected embedding dimension ${String(embedding.length)}`);
        }
        await pool.query(
          `INSERT INTO "DocumentChunk" ("id", "documentId", "section", "position", "content", "embedding", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, now())`,
          [params.documentId, params.section ?? null, chunk.position, chunk.content, toVectorLiteral(embedding)],
        );
        inserted += 1;
      } catch (error) {
        logger.error("Failed to ingest chunk", {
          documentId: params.documentId,
          position: chunk.position,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("Document ingested", { documentId: params.documentId, chunksInserted: inserted, total: chunks.length });
    return { status: "ok", chunksInserted: inserted };
  } catch (error) {
    logger.error("registerDocument failed", {
      documentId: params.documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", chunksInserted: 0 };
  }
}
