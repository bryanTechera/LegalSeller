/**
 * Ingesta CLI de un documento al corpus RAG.
 *
 * Uso: pnpm ingest <archivo.txt> --title "Ley N° 17.250 — Defensa del Consumidor (Uruguay)" [--categoria laboral --subcategoria despido]
 *
 * Crea (o re-usa por título) la fila Document y delega en registerDocument
 * el pipeline chunk → embed → pgvector. Re-ejecutar re-ingesta el documento.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { makeLogger } from "../mastra/common/logger.js";
import { getPool } from "../mastra/config/storage.js";
import { registerDocument } from "../mastra/services/document-registry/index.js";

const logger = makeLogger("Ingest");

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    options: { title: { type: "string" }, categoria: { type: "string" }, subcategoria: { type: "string" } },
    allowPositionals: true,
  });
  const filePath = positionals[0];
  const title = values.title;

  if (!filePath || !title) {
    logger.error(
      'Uso: pnpm ingest <archivo.txt> --title "<título>" [--categoria laboral --subcategoria despido]',
    );
    return 1;
  }

  const text = readFileSync(filePath, "utf8");
  const pool = getPool();

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "Document" ("id", "title", "sourceKey", "categoria", "subcategoria", "status", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'PROCESSING'::"ProcessingStatus", now(), now())
     ON CONFLICT ("title") DO UPDATE
        SET "sourceKey" = $2, "categoria" = $3, "subcategoria" = $4,
            "status" = 'PROCESSING'::"ProcessingStatus", "updatedAt" = now()
     RETURNING "id"`,
    [title, filePath, values.categoria ?? null, values.subcategoria ?? null],
  );
  const documentId = rows[0].id;
  logger.info("Ingesting document", { documentId, title, bytes: text.length });

  const result = await registerDocument({ documentId, text });
  const finalStatus = result.status === "ok" && result.chunksInserted > 0 ? "READY" : "FAILED";
  await pool.query(`UPDATE "Document" SET "status" = $2::"ProcessingStatus", "updatedAt" = now() WHERE "id" = $1`, [
    documentId,
    finalStatus,
  ]);

  logger.info("Ingest finished", { documentId, status: finalStatus, chunksInserted: result.chunksInserted });
  return finalStatus === "READY" ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    logger.error("Ingest crashed", { error: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(() => {
    void getPool().end();
  });
