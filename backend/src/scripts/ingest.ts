/**
 * Ingesta de un único archivo del corpus. Para el corpus completo, usar
 * `pnpm corpus:sync`, que es incremental.
 *
 * Uso: pnpm ingest corpus/laboral/despido/03-modalidades-despido.md
 *
 * El título y la partición se derivan del archivo y su ubicación, con la misma
 * validación contra el registry que usa el sync: no hay flags que puedan
 * contradecir lo que el agente filtra.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { makeLogger } from "../mastra/common/logger.js";
import { PIPELINE_VERSION } from "../mastra/config/embedding.js";
import { getPool } from "../mastra/config/storage.js";
import { upsertDocumento } from "../mastra/services/corpus/documento.js";
import { derivarDocumento, hashContenido } from "../mastra/services/corpus/paths.js";
import { registerDocument } from "../mastra/services/document-registry/index.js";

const logger = makeLogger("Ingest");
const CORPUS_DIR = fileURLToPath(new URL("../../corpus", import.meta.url));

async function main(): Promise<number> {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length === 0) {
    logger.error("Uso: pnpm ingest <ruta dentro de backend/corpus>/<archivo>.md");
    return 1;
  }
  const argumento = positionals[0];

  const absoluta = isAbsolute(argumento) ? argumento : resolve(process.cwd(), argumento);
  const rutaRelativa = relative(CORPUS_DIR, absoluta).split(sep).join("/");
  if (rutaRelativa.startsWith("..")) {
    logger.error("El archivo tiene que vivir dentro de backend/corpus/", { archivo: argumento });
    return 1;
  }

  const contenido = readFileSync(absoluta, "utf8");
  const doc = derivarDocumento(rutaRelativa, contenido);

  const documentId = await upsertDocumento(doc);
  logger.info("Ingesting document", { documentId, title: doc.title, bytes: contenido.length });

  const resultado = await registerDocument({
    documentId,
    text: contenido,
    contentHash: hashContenido(contenido),
    pipelineVersion: PIPELINE_VERSION,
  });

  if (resultado.status === "error") {
    await getPool().query(
      `UPDATE "Document" SET "status" = 'FAILED'::"ProcessingStatus", "updatedAt" = now() WHERE "id" = $1`,
      [documentId],
    );
    logger.error("Ingest failed", { documentId, error: resultado.error });
    return 1;
  }

  logger.info("Ingest finished", { documentId, chunksInserted: resultado.chunksInserted });
  return 0;
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
