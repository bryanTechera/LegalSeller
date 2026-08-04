import { getPool } from "../../config/storage.js";

import type { DocumentoDelCorpus } from "./paths.js";

/**
 * Creates or updates the Document row (metadata only) and returns its id.
 * On conflict does NOT touch "status": a document being re-ingested remains
 * whatever it already was (typically READY, still serviceable with its
 * previous chunks) until registerDocument's transaction actually replaces
 * them. Marking it PROCESSING here would understate its real state for the
 * window between this upsert and that commit, and would make --backfill
 * (which filters on status = READY) wrongly skip it if the process died in
 * between. A brand-new row keeps its initial 'PROCESSING' from the INSERT
 * branch, which is correct: it has no chunks yet.
 */
export async function upsertDocumento(doc: DocumentoDelCorpus): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO "Document" ("id", "title", "sourceKey", "categoria", "subcategoria", "status", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'PROCESSING'::"ProcessingStatus", now(), now())
     ON CONFLICT ("title") DO UPDATE
        SET "sourceKey" = $2, "categoria" = $3, "subcategoria" = $4, "updatedAt" = now()
     RETURNING "id"`,
    [doc.title, doc.rutaRelativa, doc.categoria, doc.subcategoria],
  );
  return rows[0].id;
}
