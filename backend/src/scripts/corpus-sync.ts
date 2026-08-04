/**
 * Sincroniza backend/corpus/ con la tabla Document: deriva la partición del
 * path, compara huellas y re-ingesta sólo lo que cambió.
 *
 * Uso: pnpm corpus:sync [--dry-run] [--backfill] [--reembed-stale]
 *
 * Los documentos de la base que no tienen archivo en disco se REPORTAN, nunca
 * se borran: la base es compartida entre los worktrees del repo y podrían ser
 * de una rama en vuelo.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { PIPELINE_VERSION } from "../mastra/config/embedding.js";
import { getPool } from "../mastra/config/storage.js";
import { decidirAccion, partesDeVersion, type AccionSync } from "../mastra/services/corpus/decidir.js";
import { upsertDocumento } from "../mastra/services/corpus/documento.js";
import { derivarDocumento, hashContenido, type DocumentoDelCorpus } from "../mastra/services/corpus/paths.js";
import { reembedDocument, registerDocument } from "../mastra/services/document-registry/index.js";

const CORPUS_DIR = fileURLToPath(new URL("../../corpus", import.meta.url));

interface FilaDeDocumento {
  id: string;
  title: string;
  contentHash: string | null;
  pipelineVersion: string | null;
}

interface ItemDelSync {
  doc: DocumentoDelCorpus;
  contenido: string;
  hash: string;
  fila: FilaDeDocumento | null;
  accion: AccionSync;
}

async function listarArchivos(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { recursive: true, withFileTypes: true });
  return entradas
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => relative(CORPUS_DIR, join(e.parentPath, e.name)).split(sep).join("/"))
    .sort();
}

async function leerBase(): Promise<Map<string, FilaDeDocumento>> {
  const { rows } = await getPool().query<FilaDeDocumento>(
    `SELECT "id", "title", "contentHash", "pipelineVersion" FROM "Document"`,
  );
  return new Map(rows.map((row) => [row.title, row]));
}

/** Derives and classifies every corpus file. Derivation errors are collected, not thrown. */
function planificar(
  rutas: string[],
  base: Map<string, FilaDeDocumento>,
): { items: ItemDelSync[]; errores: string[] } {
  const items: ItemDelSync[] = [];
  const errores: string[] = [];

  for (const ruta of rutas) {
    const contenido = readFileSync(join(CORPUS_DIR, ruta), "utf8");
    try {
      const doc = derivarDocumento(ruta, contenido);
      const hash = hashContenido(contenido);
      const fila = base.get(doc.title) ?? null;
      items.push({ doc, contenido, hash, fila, accion: decidirAccion(fila, hash, PIPELINE_VERSION) });
    } catch (error) {
      errores.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { items, errores };
}

function reportar(items: ItemDelSync[], errores: string[], base: Map<string, FilaDeDocumento>): void {
  const porAccion = (accion: AccionSync): ItemDelSync[] => items.filter((i) => i.accion === accion);
  const nuevos = porAccion("reingestar").filter((i) => i.fila === null);
  const modificados = porAccion("reingestar").filter((i) => i.fila !== null);

  console.log(`\nCorpus: ${String(items.length)} archivos · Base: ${String(base.size)} documentos`);
  console.log(`  sin cambios : ${String(porAccion("saltar").length)}`);
  console.log(`  nuevos      : ${String(nuevos.length)}`);
  console.log(`  modificados : ${String(modificados.length)}`);
  console.log(`  a re-embeber: ${String(porAccion("reembeber").length)}`);

  for (const item of [...nuevos, ...modificados, ...porAccion("reembeber")]) {
    console.log(`    [${item.accion}] ${item.doc.rutaRelativa}`);
  }

  const titulosEnDisco = new Set(items.map((i) => i.doc.title));
  const soloEnBase = [...base.keys()].filter((t) => !titulosEnDisco.has(t));
  if (soloEnBase.length > 0) {
    console.log(`\n  AVISO — ${String(soloEnBase.length)} documentos en la base sin archivo en el corpus.`);
    console.log("  No se borran: la base es compartida y pueden ser de otra rama en vuelo.");
    if (errores.length > 0) {
      console.log(
        `  ADVERTENCIA: ${String(errores.length)} archivos fallaron la derivación; alguno de los documentos listados abajo puede corresponder a esos archivos y no estar realmente huérfano.`,
      );
    }
    for (const titulo of soloEnBase) console.log(`    ${titulo}`);
  }

  if (errores.length > 0) {
    console.log(`\n  ERRORES DE DERIVACIÓN (${String(errores.length)}):`);
    for (const error of errores) console.log(`    ${error}`);
  }
}

interface ResultadoBackfill {
  marcados: number;
  /**
   * Rows already fingerprinted — the expected, benign shape of a *second*
   * `--backfill` run on an already-synced corpus. Counted apart from
   * `omitidos` so it never drives the exit code: an operator who sees this
   * script exit 1 on every re-run learns to ignore its non-zero exit, which
   * is the same signal a genuine partition mismatch uses.
   */
  yaTeniaHuella: string[];
  /** Genuine problems: a file with no row yet, or a row whose partition/status doesn't match the file. Drive the exit code. */
  omitidos: string[];
}

/**
 * Stamps fingerprints on rows ingested before they existed, without
 * re-embedding. Only touches rows that have never been fingerprinted
 * (`contentHash IS NULL`) — a row that already has one was produced by a real
 * ingestion, and stamping over it would silently detach it from its actual
 * chunks. Also requires the stored partition to match what the path derives —
 * a mismatch means the row was not produced by this file.
 */
async function backfill(items: ItemDelSync[]): Promise<ResultadoBackfill> {
  const yaTeniaHuella: string[] = [];
  const omitidos: string[] = [];
  let marcados = 0;

  for (const item of items) {
    if (item.fila === null) {
      omitidos.push(`${item.doc.rutaRelativa}: no existe en la base (requiere ingesta real)`);
      continue;
    }
    if (item.fila.contentHash !== null) {
      yaTeniaHuella.push(`${item.doc.rutaRelativa}: la fila ya tiene huella (no necesita backfill)`);
      continue;
    }
    const { rowCount } = await getPool().query(
      `UPDATE "Document"
          SET "contentHash" = $2, "pipelineVersion" = $3, "updatedAt" = now()
        WHERE "id" = $1
          AND "categoria" IS NOT DISTINCT FROM $4
          AND "subcategoria" IS NOT DISTINCT FROM $5
          AND "status" = 'READY'::"ProcessingStatus"
          AND "contentHash" IS NULL`,
      [item.fila.id, item.hash, PIPELINE_VERSION, item.doc.categoria, item.doc.subcategoria],
    );
    if (rowCount === 1) marcados += 1;
    else omitidos.push(`${item.doc.rutaRelativa}: la partición o el estado de la fila no coinciden con el archivo`);
  }
  return { marcados, yaTeniaHuella, omitidos };
}

interface ResultadoReembedStale {
  reembebidos: number;
  /** Rows whose chunking half moved (or whose stored pipelineVersion is missing/malformed) — the stored chunks have the wrong boundaries, so only a real re-ingest from the .md can fix them. */
  noResolubles: string[];
  /** reembedDocument itself failed (e.g. embeddings API error) for a row that WAS resolvable. */
  fallos: string[];
}

/**
 * Database-driven counterpart to the file-driven sync: reaches rows whose
 * `.md` may not exist in the current checkout (a pipeline migration on a
 * database shared by eight worktrees). Selects every Document row whose
 * pipelineVersion differs from the current one — including NULL, which
 * cannot be resolved this way either, since without a previous version there
 * is no way to confirm the chunking half is unchanged.
 */
async function reembedStale(): Promise<ResultadoReembedStale> {
  const { rows } = await getPool().query<{ id: string; title: string; pipelineVersion: string | null }>(
    `SELECT "id", "title", "pipelineVersion" FROM "Document" WHERE "pipelineVersion" IS DISTINCT FROM $1`,
    [PIPELINE_VERSION],
  );

  const actual = partesDeVersion(PIPELINE_VERSION);
  const noResolubles: string[] = [];
  const fallos: string[] = [];
  let reembebidos = 0;

  for (const fila of rows) {
    const enBase = fila.pipelineVersion === null ? null : partesDeVersion(fila.pipelineVersion);
    if (enBase === null || actual === null) {
      noResolubles.push(`${fila.title}: sin pipelineVersion previo o con formato inválido — requiere el .md (reingesta real)`);
      continue;
    }
    if (enBase.chunk !== actual.chunk) {
      noResolubles.push(
        `${fila.title}: cambió el chunkeo — los chunks guardados tienen los límites viejos, requiere el .md (reingesta real)`,
      );
      continue;
    }
    const resultado = await reembedDocument(fila.id, PIPELINE_VERSION);
    if (resultado.status === "error") {
      fallos.push(`${fila.title}: ${resultado.error ?? "error"}`);
    } else {
      reembebidos += 1;
      console.log(`  re-embebido  ${fila.title} (${String(resultado.chunksInserted)} chunks)`);
    }
  }
  return { reembebidos, noResolubles, fallos };
}

async function ejecutar(items: ItemDelSync[]): Promise<string[]> {
  const fallos: string[] = [];

  for (const item of items) {
    if (item.accion === "saltar") continue;

    if (item.accion === "reembeber" && item.fila !== null) {
      const resultado = await reembedDocument(item.fila.id, PIPELINE_VERSION);
      if (resultado.status === "error") fallos.push(`${item.doc.rutaRelativa}: ${resultado.error ?? "error"}`);
      else console.log(`  re-embebido  ${item.doc.rutaRelativa} (${String(resultado.chunksInserted)} chunks)`);
      continue;
    }

    const documentId = await upsertDocumento(item.doc);
    const resultado = await registerDocument({
      documentId,
      text: item.contenido,
      contentHash: item.hash,
      pipelineVersion: PIPELINE_VERSION,
    });
    if (resultado.status === "error") {
      fallos.push(`${item.doc.rutaRelativa}: ${resultado.error ?? "error"}`);
      await getPool().query(
        `UPDATE "Document" SET "status" = 'FAILED'::"ProcessingStatus", "updatedAt" = now() WHERE "id" = $1`,
        [documentId],
      );
    } else {
      console.log(`  ingestado    ${item.doc.rutaRelativa} (${String(resultado.chunksInserted)} chunks)`);
    }
  }
  return fallos;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      backfill: { type: "boolean", default: false },
      "reembed-stale": { type: "boolean", default: false },
    },
  });

  console.log(`pipelineVersion actual: ${PIPELINE_VERSION}`);

  const [rutas, base] = await Promise.all([listarArchivos(CORPUS_DIR), leerBase()]);
  const { items, errores } = planificar(rutas, base);
  reportar(items, errores, base);

  if (values["dry-run"]) {
    console.log("\n--dry-run: no se escribió nada.");
    return errores.length > 0 ? 1 : 0;
  }

  if (values.backfill) {
    const { marcados, yaTeniaHuella, omitidos } = await backfill(items);
    console.log(`\nbackfill: ${String(marcados)} filas marcadas sin re-embeber.`);
    if (yaTeniaHuella.length > 0) {
      console.log(`  ya tenían huella (esperado en una segunda corrida, no cuenta como problema): ${String(yaTeniaHuella.length)}`);
      for (const item of yaTeniaHuella) console.log(`    ${item}`);
    }
    if (omitidos.length > 0) {
      console.log(`  OMITIDOS (${String(omitidos.length)}):`);
      for (const omitido of omitidos) console.log(`    ${omitido}`);
    }
    return errores.length > 0 || omitidos.length > 0 ? 1 : 0;
  }

  if (values["reembed-stale"]) {
    const { reembebidos, noResolubles, fallos } = await reembedStale();
    console.log(`\nreembed-stale: ${String(reembebidos)} documentos re-embebidos.`);
    if (noResolubles.length > 0) {
      console.log(`  NO RESOLUBLE SIN .md (${String(noResolubles.length)}):`);
      for (const item of noResolubles) console.log(`    ${item}`);
    }
    if (fallos.length > 0) {
      console.log(`  FALLOS (${String(fallos.length)}):`);
      for (const fallo of fallos) console.log(`    ${fallo}`);
    }
    return errores.length > 0 || noResolubles.length > 0 || fallos.length > 0 ? 1 : 0;
  }

  console.log("");
  const fallos = await ejecutar(items);
  if (fallos.length > 0) {
    console.log(`\nFALLOS (${String(fallos.length)}):`);
    for (const fallo of fallos) console.log(`  ${fallo}`);
  }
  return errores.length > 0 || fallos.length > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("corpus:sync crashed", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void getPool().end();
  });
