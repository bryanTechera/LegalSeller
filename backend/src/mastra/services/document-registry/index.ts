import { makeLogger } from "../../common/logger.js";
import {
  EMBEDDING_DIMENSION,
  EMBEDDING_TASK_TYPE,
  generateEmbedding,
  toVectorLiteral,
} from "../../config/embedding.js";
import { getPool } from "../../config/storage.js";
import { chunkText } from "../../utils/chunking.js";

const logger = makeLogger("DocumentRegistry");

/** Parallel embedding requests. Kept modest to stay clear of provider rate limits. */
const EMBED_CONCURRENCY = 6;

export interface RegisterDocumentParams {
  /** Id of the Document row. */
  documentId: string;
  /** Full text of the source file. */
  text: string;
  /** Optional section label applied to all chunks. */
  section?: string;
  /** sha256 of `text`, stored so the next sync can skip an unchanged file. */
  contentHash: string;
  /** PIPELINE_VERSION at the time of embedding. */
  pipelineVersion: string;
}

export interface RegisterDocumentResult {
  status: "ok" | "error";
  chunksInserted: number;
  error?: string;
}

/** Embeds every text with bounded concurrency. Rejects if any single one fails. */
async function embedAll(textos: string[]): Promise<number[][]> {
  const salida: number[][] = new Array<number[]>(textos.length);
  let siguiente = 0;

  async function worker(): Promise<void> {
    while (siguiente < textos.length) {
      const indice = siguiente;
      siguiente += 1;
      const embedding = await generateEmbedding(textos[indice], EMBEDDING_TASK_TYPE);
      if (embedding.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Unexpected embedding dimension ${String(embedding.length)}`);
      }
      salida[indice] = embedding;
    }
  }

  await Promise.all(Array.from({ length: Math.min(EMBED_CONCURRENCY, textos.length) }, () => worker()));
  return salida;
}

/**
 * Writes chunks + embeddings + fingerprints for one document in a single
 * transaction. Embedding happens BEFORE the transaction opens: a provider
 * failure must leave the previous version of the document untouched, not a
 * half-deleted one marked READY.
 */
async function escribirChunks(
  documentId: string,
  section: string | null,
  chunks: { content: string; position: number }[],
  embeddings: number[][],
  contentHash: string,
  pipelineVersion: string,
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // Serializes concurrent writers on the same Document: without this, two
    // overlapping syncs of the same file can both pass READ COMMITTED's
    // snapshot check and each insert their own full set of chunks, leaving
    // duplicates (B's DELETE blocks on A's row lock, but B's SELECT snapshot
    // was taken before A committed, so B never sees A's new rows to delete).
    await client.query(`SELECT "id" FROM "Document" WHERE "id" = $1 FOR UPDATE`, [documentId]);
    await client.query(`DELETE FROM "DocumentChunk" WHERE "documentId" = $1`, [documentId]);
    for (const [indice, chunk] of chunks.entries()) {
      await client.query(
        `INSERT INTO "DocumentChunk" ("id", "documentId", "section", "position", "content", "embedding", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, now())`,
        [documentId, section, chunk.position, chunk.content, toVectorLiteral(embeddings[indice])],
      );
    }
    await client.query(
      `UPDATE "Document"
          SET "contentHash" = $2, "pipelineVersion" = $3,
              "status" = 'READY'::"ProcessingStatus", "updatedAt" = now()
        WHERE "id" = $1`,
      [documentId, contentHash, pipelineVersion],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      logger.error("ROLLBACK failed", {
        documentId,
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }
    throw error;
  } finally {
    client.release();
  }
}

/** RAG ingestion: chunk -> embed -> write, atomically. */
export async function registerDocument(params: RegisterDocumentParams): Promise<RegisterDocumentResult> {
  const chunks = chunkText(params.text);
  if (chunks.length === 0) {
    return { status: "error", chunksInserted: 0, error: "el documento no produjo ningún chunk (texto vacío)" };
  }

  try {
    const embeddings = await embedAll(chunks.map((chunk) => chunk.content));
    await escribirChunks(
      params.documentId,
      params.section ?? null,
      chunks,
      embeddings,
      params.contentHash,
      params.pipelineVersion,
    );
    logger.info("Document ingested", { documentId: params.documentId, chunksInserted: chunks.length });
    return { status: "ok", chunksInserted: chunks.length };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    logger.error("registerDocument failed", { documentId: params.documentId, error: mensaje });
    return { status: "error", chunksInserted: 0, error: mensaje };
  }
}

/**
 * Re-embeds a document's stored chunks in place, without re-reading the source
 * file. Valid only when the chunking half of the fingerprint is unchanged (the
 * caller guarantees this via decidirAccion), because chunk text is reused as-is.
 */
export async function reembedDocument(documentId: string, pipelineVersion: string): Promise<RegisterDocumentResult> {
  try {
    const { rows } = await getPool().query<{ id: string; content: string }>(
      `SELECT "id", "content" FROM "DocumentChunk" WHERE "documentId" = $1 ORDER BY "position"`,
      [documentId],
    );
    if (rows.length === 0) {
      return { status: "error", chunksInserted: 0, error: "el documento no tiene chunks guardados para re-embeber" };
    }

    const embeddings = await embedAll(rows.map((row) => row.content));

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      // Same concurrency guard as escribirChunks — see the comment there.
      await client.query(`SELECT "id" FROM "Document" WHERE "id" = $1 FOR UPDATE`, [documentId]);
      for (const [indice, row] of rows.entries()) {
        await client.query(`UPDATE "DocumentChunk" SET "embedding" = $2::vector WHERE "id" = $1`, [
          row.id,
          toVectorLiteral(embeddings[indice]),
        ]);
      }
      await client.query(`UPDATE "Document" SET "pipelineVersion" = $2, "updatedAt" = now() WHERE "id" = $1`, [
        documentId,
        pipelineVersion,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        logger.error("ROLLBACK failed", {
          documentId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      throw error;
    } finally {
      client.release();
    }

    logger.info("Document re-embedded", { documentId, chunks: rows.length });
    return { status: "ok", chunksInserted: rows.length };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    logger.error("reembedDocument failed", { documentId, error: mensaje });
    return { status: "error", chunksInserted: 0, error: mensaje };
  }
}
