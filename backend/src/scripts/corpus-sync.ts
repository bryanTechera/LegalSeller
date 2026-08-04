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
import { decidirAccion, type AccionSync } from "../mastra/services/corpus/decidir.js";
import { derivarDocumento, hashContenido, type DocumentoDelCorpus } from "../mastra/services/corpus/paths.js";

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

  console.log("\nLa escritura se implementa en la Tarea 7.");
  return errores.length > 0 ? 1 : 0;
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
