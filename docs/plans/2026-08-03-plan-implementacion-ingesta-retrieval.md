# Ingesta incremental y calidad del retrieval — plan de implementación

> **Para workers agénticos:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Goal:** Que la ingesta del corpus sólo re-embeba lo que cambió, que el umbral de similitud de `buscar-documentos` corte de verdad, y que la decisión sobre reranking se tome con una métrica.

**Architecture:** Dos columnas de huella en `Document` (`contentHash` para el archivo, `pipelineVersion` para el pipeline de chunkeo+embedding) permiten decidir por documento entre saltar, re-chunkear o re-embeber. Un comando `pnpm corpus:sync` recorre `backend/corpus/`, deriva la partición del path validándola contra el registry de dominios, y aplica esa decisión dentro de una transacción por documento. Un golden set de retrieval con items positivos y negativos, colgado del runner de evals existente, hace medible el umbral y la decisión sobre reranking.

**Tech Stack:** TypeScript ES Modules, Node 22, `pg` (SQL crudo sobre pgvector), `@google/genai` (embeddings), Prisma (sólo dueño del schema, desde `frontend/`), Vitest, `tsx` para scripts CLI.

**Spec:** `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md`. Ante cualquier duda de diseño, esa es la fuente.

## Global Constraints

- **NUNCA `any`** — `unknown` + Zod. Contratos como schema Zod, tipos con `z.infer`.
- **NUNCA `console.log` en código de producción** — logger estructurado (`makeLogger`). Los scripts CLI bajo `src/scripts/` y el runner de evals sí imprimen a stdout: es su interfaz.
- **NUNCA una tool de agente tira excepción en `execute`** — degradación graceful `{ status: "error", mensaje }`.
- **Conventional commits**; `pnpm lint` + `pnpm test` antes de cada commit.
- **Imports por subpath de Mastra** (`@mastra/core/agent`), nunca el barrel. Imports relativos siempre con extensión `.js`.
- **Naming**: código en inglés camelCase; ids y archivos en kebab-case español; prosa en español rioplatense.
- **`@typescript-eslint/restrict-template-expressions` rechaza `number` en template literals** — todo número interpolado va con `String(n)`.
- **La base es compartida entre los ocho worktrees del repo** (mismo `DATABASE_URL`). Ninguna tarea borra filas de `Document` ni de `DocumentChunk` que no esté re-escribiendo en el mismo acto.
- **Valores exactos que no se cambian en este plan**: `EMBEDDING_DIMENSION = 3072`, modelo `gemini-embedding-001`, `chunkSize` 2000, `overlap` 200.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `backend/src/mastra/services/corpus/paths.ts` | Derivar `{categoria, subcategoria, title}` de la ruta y el contenido de un `.md`, validando contra el registry. Hash del contenido. Puro. |
| `backend/src/mastra/services/corpus/paths.test.ts` | Tests de la derivación y sus errores. |
| `backend/src/mastra/services/corpus/decidir.ts` | Matriz de decisión saltar / reingestar / reembeber. Puro. |
| `backend/src/mastra/services/corpus/decidir.test.ts` | Tests de la matriz. |
| `backend/src/scripts/corpus-sync.ts` | CLI: recorre el corpus, deriva, decide, ejecuta, reporta. Modos `--dry-run`, `--backfill`, `--reembed-stale`. |
| `backend/src/test/retrieval/run-retrieval.ts` | Eval de retrieval: embebe consultas, consulta pgvector, calcula recall@5, recall@20 y vacío correcto. |
| `backend/src/test/retrieval/datasets/*.json` | Golden set por categoría. |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `frontend/prisma/schema.prisma` | Columnas `contentHash` y `pipelineVersion` en `Document`. |
| `backend/src/mastra/utils/chunking.ts` | Exportar `CHUNK_SIZE` y `CHUNK_OVERLAP`. |
| `backend/src/mastra/config/embedding.ts` | `taskType` parametrizable; huellas `EMBED_FINGERPRINT`, `CHUNK_FINGERPRINT`, `PIPELINE_VERSION`. |
| `backend/src/mastra/services/document-registry/index.ts` | Embeber fuera de transacción con concurrencia; escribir dentro de una transacción; nueva función `reembedDocument`. |
| `backend/src/mastra/tools/documentos/buscar-documentos-tool.ts` | Nuevo valor de `MIN_SIMILARITY` (Tarea 10). |
| `backend/src/test/run-evals.ts` | Umbral por dataset; registrar los evals de retrieval. |
| `backend/src/scripts/ingest.ts` | Delegar en el camino del sync. |
| `backend/package.json` | Script `corpus:sync`. |

---

## Task 1: Columnas de huella en `Document`

**Files:**
- Modify: `frontend/prisma/schema.prisma:16-32`
- Create: `frontend/prisma/migrations/<timestamp>_document_huella/migration.sql` (la genera Prisma)

**Interfaces:**
- Consumes: nada.
- Produces: columnas `Document.contentHash` (`TEXT NULL`) y `Document.pipelineVersion` (`TEXT NULL`), leídas por SQL crudo desde el backend en las tareas 6, 8 y 12.

- [ ] **Step 1: Agregar las columnas al modelo**

En `frontend/prisma/schema.prisma`, dentro de `model Document`, después de la línea de `subcategoria`:

```prisma
  /// sha256 del texto del archivo .md que originó el documento. NULL = ingestado
  /// antes de que existiera el sync incremental (se completa con --backfill).
  contentHash     String?
  /// Huella del pipeline que produjo los embeddings: modelo|taskType|chunkSize:overlap.
  /// Distinta de la actual = los chunks están viejos. Ver backend/src/mastra/config/embedding.ts.
  pipelineVersion String?
```

- [ ] **Step 2: Generar la migración**

```bash
cd frontend && pnpm prisma migrate dev --name document_huella
```

Esperado: crea la migración y la aplica. Si Prisma reporta drift sobre tablas del schema `mastra`, **parar y no aceptar el reset** — significa que `PostgresStore` creó sus tablas en `public` (gotcha conocido, `schemaName: "mastra"` en `backend/src/mastra/config/storage.ts`).

- [ ] **Step 3: Verificar que las columnas existen y que ninguna fila se tocó**

```bash
cd frontend && pnpm prisma db execute --stdin <<'SQL'
SELECT count(*) AS total,
       count("contentHash") AS con_hash,
       count("pipelineVersion") AS con_version
  FROM "Document";
SQL
```

Esperado: `total = 155`, `con_hash = 0`, `con_version = 0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(rag): columnas de huella contentHash y pipelineVersion en Document"
```

---

## Task 2: Huellas del pipeline y `taskType` parametrizable

**Files:**
- Modify: `backend/src/mastra/utils/chunking.ts:15-16`
- Modify: `backend/src/mastra/config/embedding.ts`
- Create: `backend/src/mastra/config/embedding.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `CHUNK_SIZE: number` y `CHUNK_OVERLAP: number` desde `utils/chunking.js`.
  - `type EmbeddingTaskType = "NINGUNO" | "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"`.
  - `EMBEDDING_TASK_TYPE: EmbeddingTaskType` (constante de configuración; arranca en `"NINGUNO"`).
  - `PIPELINE_VERSION: string` con formato `<modelo>|<taskType>|<chunkSize>:<overlap>`.
  - `generateEmbedding(text: string, taskType?: EmbeddingTaskType): Promise<number[]>`.

**Nota de diseño:** esta tarea **no cambia ningún vector**. `EMBEDDING_TASK_TYPE` arranca en `"NINGUNO"` y en ese caso la llamada al SDK sale idéntica a la de hoy (sin `config`). El cambio real de `taskType` es la Tarea 12, y ahí es donde `PIPELINE_VERSION` cambia sola y dispara el re-embedding.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/mastra/config/embedding.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CHUNK_OVERLAP, CHUNK_SIZE } from "../utils/chunking.js";
import { CHUNK_FINGERPRINT, EMBED_FINGERPRINT, PIPELINE_VERSION } from "./embedding.js";

describe("huellas del pipeline", () => {
  it("PIPELINE_VERSION combina la huella de embedding y la de chunkeo", () => {
    expect(PIPELINE_VERSION).toBe(`${EMBED_FINGERPRINT}|${CHUNK_FINGERPRINT}`);
  });

  it("la huella de chunkeo refleja los parámetros reales de chunkText", () => {
    expect(CHUNK_FINGERPRINT).toBe(`${String(CHUNK_SIZE)}:${String(CHUNK_OVERLAP)}`);
  });

  it("la huella de embedding nombra el modelo y el taskType", () => {
    expect(EMBED_FINGERPRINT).toContain("gemini-embedding-001");
    expect(EMBED_FINGERPRINT.split("|")).toHaveLength(2);
  });

  it("PIPELINE_VERSION tiene exactamente tres segmentos separados por |", () => {
    // La Tarea 4 parsea esta forma para distinguir un cambio de chunkeo
    // (requiere el archivo) de uno de embedding (se resuelve desde la base).
    expect(PIPELINE_VERSION.split("|")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd backend && pnpm vitest run src/mastra/config/embedding.test.ts
```

Esperado: FAIL — `CHUNK_SIZE`, `CHUNK_OVERLAP`, `CHUNK_FINGERPRINT`, `EMBED_FINGERPRINT` y `PIPELINE_VERSION` no existen.

- [ ] **Step 3: Exportar los parámetros de chunkeo**

En `backend/src/mastra/utils/chunking.ts`, reemplazar las dos constantes privadas:

```ts
/** Target chunk size in characters. Part of PIPELINE_VERSION: changing it invalidates every stored chunk. */
export const CHUNK_SIZE = 2000;
/** Overlap between consecutive chunks, in characters. Part of PIPELINE_VERSION. */
export const CHUNK_OVERLAP = 200;
```

Y en `chunkText`, cambiar los defaults:

```ts
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  const overlap = options.overlap ?? CHUNK_OVERLAP;
```

- [ ] **Step 4: Parametrizar `taskType` y derivar las huellas**

Reescribir `backend/src/mastra/config/embedding.ts` completo:

```ts
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
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
cd backend && pnpm vitest run src/mastra/config/embedding.test.ts src/mastra/utils/chunking.test.ts
```

Esperado: PASS en ambos archivos. El de chunking debe seguir pasando sin cambios — es la prueba de que exportar las constantes no movió el comportamiento.

- [ ] **Step 6: Lint y commit**

```bash
cd backend && pnpm lint
git add backend/src/mastra/config/embedding.ts backend/src/mastra/config/embedding.test.ts backend/src/mastra/utils/chunking.ts
git commit -m "feat(rag): huella de pipeline derivada y taskType parametrizable en embeddings"
```

---

## Task 3: Derivación y validación del path del corpus

**Files:**
- Create: `backend/src/mastra/services/corpus/paths.ts`
- Create: `backend/src/mastra/services/corpus/paths.test.ts`

**Interfaces:**
- Consumes: `CATEGORIAS`, `CategoriaId` de `../../dominios/registry.js`.
- Produces:
  - `interface DocumentoDelCorpus { rutaRelativa: string; categoria: CategoriaId; subcategoria: string | null; title: string }`
  - `derivarDocumento(rutaRelativa: string, contenido: string): DocumentoDelCorpus` — tira `Error` con mensaje accionable si algo no valida.
  - `hashContenido(contenido: string): string` — sha256 hex.
  - `SUBCARPETA_TRANSVERSAL = "generales"`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/mastra/services/corpus/paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { derivarDocumento, hashContenido } from "./paths.js";

const CONTENIDO = "# Despido — Modalidades de despido\n\nTexto del documento.";

describe("derivarDocumento", () => {
  it("deriva categoría, subcategoría y título de una ruta habilitada", () => {
    const doc = derivarDocumento("laboral/despido/03-modalidades-despido.md", CONTENIDO);
    expect(doc).toEqual({
      rutaRelativa: "laboral/despido/03-modalidades-despido.md",
      categoria: "laboral",
      subcategoria: "despido",
      title: "Despido — Modalidades de despido",
    });
  });

  it("mapea la carpeta generales a subcategoria NULL (corpus transversal)", () => {
    // El retrieval mantiene en alcance los documentos con subcategoria NULL
    // vía `OR d."subcategoria" IS NULL`. Cargarlos como "generales" los deja
    // invisibles al filtro del agente — es el bug del 2026-07-21.
    const doc = derivarDocumento("laboral/generales/01-prescripcion.md", CONTENIDO);
    expect(doc.subcategoria).toBeNull();
  });

  it("rechaza una categoría que no existe en el registry", () => {
    expect(() => derivarDocumento("penal/generales/01-x.md", CONTENIDO)).toThrow(/penal/);
  });

  it("rechaza una subcategoría que el agente no filtra", () => {
    expect(() => derivarDocumento("laboral/inventada/01-x.md", CONTENIDO)).toThrow(/inventada/);
  });

  it("el error de subcategoría desconocida lista las válidas", () => {
    expect(() => derivarDocumento("laboral/inventada/01-x.md", CONTENIDO)).toThrow(/despido/);
  });

  it("rechaza un archivo sin encabezado de título", () => {
    expect(() => derivarDocumento("laboral/despido/01-x.md", "Sin encabezado.")).toThrow(/encabezado/);
  });

  it("rechaza una ruta con profundidad inesperada", () => {
    expect(() => derivarDocumento("laboral/01-x.md", CONTENIDO)).toThrow(/categoria/);
  });
});

describe("hashContenido", () => {
  it("es estable para el mismo texto y distinto para textos distintos", () => {
    expect(hashContenido("abc")).toBe(hashContenido("abc"));
    expect(hashContenido("abc")).not.toBe(hashContenido("abd"));
  });

  it("devuelve sha256 en hex (64 caracteres)", () => {
    expect(hashContenido("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend && pnpm vitest run src/mastra/services/corpus/paths.test.ts
```

Esperado: FAIL — el módulo `./paths.js` no existe.

- [ ] **Step 3: Implementar la derivación**

Crear `backend/src/mastra/services/corpus/paths.ts`:

```ts
import { createHash } from "node:crypto";

import { CATEGORIAS, type CategoriaId } from "../../dominios/registry.js";

/** Folder name that maps to a category-level (cross-cutting) document. */
export const SUBCARPETA_TRANSVERSAL = "generales";

export interface DocumentoDelCorpus {
  /** Path relative to backend/corpus, POSIX separators. */
  rutaRelativa: string;
  categoria: CategoriaId;
  /** null for cross-cutting corpus, which stays in scope for every subcategoria. */
  subcategoria: string | null;
  title: string;
}

/**
 * Derives a document's partition from its location in the corpus tree and its
 * title from the leading `# ` heading, validating both against the domain
 * registry. Throwing here is the point: a subcategoria the agent never filters
 * by would load documents that no query can reach.
 */
export function derivarDocumento(rutaRelativa: string, contenido: string): DocumentoDelCorpus {
  const segmentos = rutaRelativa.split("/");
  if (segmentos.length !== 3) {
    throw new Error(
      `Ruta inesperada "${rutaRelativa}": se espera <categoria>/<subcategoria>/<archivo>.md bajo backend/corpus.`,
    );
  }
  const [categoriaId, subcarpeta] = segmentos;

  const categoria = CATEGORIAS.find((c) => c.id === categoriaId);
  if (categoria === undefined) {
    throw new Error(
      `Categoría desconocida "${categoriaId}" en ${rutaRelativa}. Las del registry: ${CATEGORIAS.map((c) => c.id).join(", ")}.`,
    );
  }
  if (!categoria.habilitada) {
    throw new Error(`Categoría "${categoriaId}" no está habilitada (${rutaRelativa}); no hay agente que la consulte.`);
  }

  const subcategoria = subcarpeta === SUBCARPETA_TRANSVERSAL ? null : subcarpeta;
  if (subcategoria !== null) {
    const def = categoria.subcategorias.find((s) => s.id === subcategoria);
    if (def === undefined) {
      throw new Error(
        `Subcategoría desconocida "${subcategoria}" para ${categoriaId} (${rutaRelativa}). Las que el agente filtra: ${categoria.subcategorias.map((s) => s.id).join(", ")}.`,
      );
    }
    if (!def.habilitada) {
      throw new Error(`Subcategoría "${subcategoria}" no está habilitada (${rutaRelativa}).`);
    }
  }

  return { rutaRelativa, categoria: categoria.id, subcategoria, title: extraerTitulo(contenido, rutaRelativa) };
}

function extraerTitulo(contenido: string, rutaRelativa: string): string {
  const primeraLinea = contenido.split("\n", 1)[0].trim();
  if (!primeraLinea.startsWith("# ")) {
    throw new Error(`${rutaRelativa} no arranca con un encabezado "# <título>"; el título del documento sale de ahí.`);
  }
  const title = primeraLinea.slice(2).trim();
  if (title.length === 0) throw new Error(`${rutaRelativa} tiene el encabezado vacío.`);
  return title;
}

/** sha256 of the file text. Stored as Document.contentHash. */
export function hashContenido(contenido: string): string {
  return createHash("sha256").update(contenido, "utf8").digest("hex");
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd backend && pnpm vitest run src/mastra/services/corpus/paths.test.ts
```

Esperado: PASS, 9 tests.

- [ ] **Step 5: Lint y commit**

```bash
cd backend && pnpm lint
git add backend/src/mastra/services/corpus/paths.ts backend/src/mastra/services/corpus/paths.test.ts
git commit -m "feat(rag): derivación y validación del path del corpus contra el registry"
```

---

## Task 4: Matriz de decisión del sync

**Files:**
- Create: `backend/src/mastra/services/corpus/decidir.ts`
- Create: `backend/src/mastra/services/corpus/decidir.test.ts`

**Interfaces:**
- Consumes: nada (función pura; recibe las huellas como strings).
- Produces:
  - `type AccionSync = "saltar" | "reingestar" | "reembeber"`
  - `interface EstadoEnBase { contentHash: string | null; pipelineVersion: string | null }`
  - `decidirAccion(base: EstadoEnBase | null, hashArchivo: string, versionActual: string): AccionSync`

**Nota de diseño:** `"reembeber"` sólo es válido si el **chunkeo** no cambió — si cambió, los chunks guardados tienen los límites viejos y hay que rehacerlos desde el archivo. Por eso `PIPELINE_VERSION` tiene tres segmentos y esta función los compara por separado. Es la mitigación del riesgo registrado en el §10 del spec.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/mastra/services/corpus/decidir.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { decidirAccion } from "./decidir.js";

const VERSION = "gemini-embedding-001|NINGUNO|2000:200";
const HASH = "a".repeat(64);

describe("decidirAccion", () => {
  it("documento nuevo (sin fila en la base): reingestar", () => {
    expect(decidirAccion(null, HASH, VERSION)).toBe("reingestar");
  });

  it("misma huella de archivo y de pipeline: saltar", () => {
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: VERSION }, HASH, VERSION)).toBe("saltar");
  });

  it("cambió el archivo: reingestar", () => {
    expect(decidirAccion({ contentHash: "b".repeat(64), pipelineVersion: VERSION }, HASH, VERSION)).toBe("reingestar");
  });

  it("cambió el taskType con el mismo archivo: reembeber desde los chunks guardados", () => {
    const vieja = "gemini-embedding-001|NINGUNO|2000:200";
    const nueva = "gemini-embedding-001|RETRIEVAL_DOCUMENT|2000:200";
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: vieja }, HASH, nueva)).toBe("reembeber");
  });

  it("cambió el chunkeo: reingestar, porque los chunks guardados tienen los límites viejos", () => {
    const vieja = "gemini-embedding-001|NINGUNO|2000:200";
    const nueva = "gemini-embedding-001|NINGUNO|1200:150";
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: vieja }, HASH, nueva)).toBe("reingestar");
  });

  it("fila legada sin huellas (ambas NULL): reingestar", () => {
    // Estado de las 155 filas antes del --backfill de la Tarea 7.
    expect(decidirAccion({ contentHash: null, pipelineVersion: null }, HASH, VERSION)).toBe("reingestar");
  });

  it("huella de pipeline con forma inesperada: reingestar (no se arriesga un reembeber inválido)", () => {
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: "basura" }, HASH, VERSION)).toBe("reingestar");
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend && pnpm vitest run src/mastra/services/corpus/decidir.test.ts
```

Esperado: FAIL — el módulo `./decidir.js` no existe.

- [ ] **Step 3: Implementar la matriz**

Crear `backend/src/mastra/services/corpus/decidir.ts`:

```ts
/** What the sync must do with one corpus file. */
export type AccionSync = "saltar" | "reingestar" | "reembeber";

/** Fingerprints currently stored for a Document row. */
export interface EstadoEnBase {
  contentHash: string | null;
  pipelineVersion: string | null;
}

interface PartesDeVersion {
  /** modelo|taskType — a change here is fixable from stored chunk text. */
  embed: string;
  /** chunkSize:overlap — a change here moves chunk boundaries, so it needs the file. */
  chunk: string;
}

function partesDeVersion(version: string): PartesDeVersion | null {
  const partes = version.split("|");
  if (partes.length !== 3) return null;
  return { embed: `${partes[0]}|${partes[1]}`, chunk: partes[2] };
}

/**
 * Decides what to do with a corpus file given what the database already holds.
 * "reembeber" is only reachable when the chunking half of the fingerprint is
 * unchanged: stored chunks are reusable as text only if their boundaries still
 * match the current chunker. Anything ambiguous falls back to "reingestar",
 * which is always correct (just more expensive).
 */
export function decidirAccion(
  base: EstadoEnBase | null,
  hashArchivo: string,
  versionActual: string,
): AccionSync {
  if (base === null || base.contentHash === null || base.contentHash !== hashArchivo) return "reingestar";
  if (base.pipelineVersion === versionActual) return "saltar";

  const enBase = base.pipelineVersion === null ? null : partesDeVersion(base.pipelineVersion);
  const actual = partesDeVersion(versionActual);
  if (enBase === null || actual === null || enBase.chunk !== actual.chunk) return "reingestar";
  return "reembeber";
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd backend && pnpm vitest run src/mastra/services/corpus/decidir.test.ts
```

Esperado: PASS, 7 tests.

- [ ] **Step 5: Lint y commit**

```bash
cd backend && pnpm lint
git add backend/src/mastra/services/corpus/decidir.ts backend/src/mastra/services/corpus/decidir.test.ts
git commit -m "feat(rag): matriz de decisión saltar/reingestar/reembeber del sync"
```

---

## Task 5: `registerDocument` transaccional con embedding concurrente

**Files:**
- Modify: `backend/src/mastra/services/document-registry/index.ts` (reescritura completa)
- Create: `backend/src/mastra/services/document-registry/index.test.ts`

**Interfaces:**
- Consumes: `generateEmbedding`, `EMBEDDING_DIMENSION`, `EMBEDDING_TASK_TYPE` de `../../config/embedding.js`; `getPool` de `../../config/storage.js`; `chunkText` de `../../utils/chunking.js`.
- Produces:
  - `registerDocument(params: RegisterDocumentParams): Promise<RegisterDocumentResult>` con `RegisterDocumentParams = { documentId: string; text: string; section?: string; contentHash: string; pipelineVersion: string }` y `RegisterDocumentResult = { status: "ok" | "error"; chunksInserted: number; error?: string }`.
  - `reembedDocument(documentId: string, pipelineVersion: string): Promise<RegisterDocumentResult>` — re-embebe los chunks ya guardados sin tocar su texto.

**Nota de diseño:** hoy la función borra los chunks y después embebe e inserta de a uno, así que un fallo a mitad deja el documento mutilado y marcado `READY`. El orden nuevo es: chunkear → embeber todo fuera de transacción → escribir todo dentro de una. Si un embedding falla, la transacción nunca se abre.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/mastra/services/document-registry/index.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateEmbedding = vi.fn();
const query = vi.fn();
const release = vi.fn();
const connect = vi.fn();

vi.mock("../../config/embedding.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../config/embedding.js")>();
  return { ...real, generateEmbedding };
});

vi.mock("../../config/storage.js", () => ({
  getPool: () => ({ connect, query }),
}));

const { registerDocument } = await import("./index.js");

const VECTOR = Array.from({ length: 3072 }, () => 0.1);

beforeEach(() => {
  // clearAllMocks NO vacía la cola de mockResolvedValueOnce pendiente entre tests.
  vi.resetAllMocks();
  connect.mockResolvedValue({ query, release });
  query.mockResolvedValue({ rows: [] });
  generateEmbedding.mockResolvedValue(VECTOR);
});

describe("registerDocument", () => {
  it("escribe chunks y huellas dentro de una transacción", async () => {
    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("ok");
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.at(-1)).toBe("COMMIT");
    expect(sqls.some((s) => s.includes('DELETE FROM "DocumentChunk"'))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE "Document"'))).toBe(true);
  });

  it("si un embedding falla, no abre transacción y el documento queda intacto", async () => {
    generateEmbedding.mockRejectedValue(new Error("429 rate limit"));

    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("error");
    expect(query).not.toHaveBeenCalled();
  });

  it("rechaza un embedding con dimensión inesperada sin escribir nada", async () => {
    generateEmbedding.mockResolvedValue([0.1, 0.2]);

    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("error");
    expect(query).not.toHaveBeenCalled();
  });

  it("si falla una escritura, hace ROLLBACK", async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO "DocumentChunk"')) throw new Error("deadlock");
      return Promise.resolve({ rows: [] });
    });

    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("error");
    expect(query.mock.calls.map((c) => String(c[0]))).toContain("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
cd backend && pnpm vitest run src/mastra/services/document-registry/index.test.ts
```

Esperado: FAIL — `registerDocument` no acepta `contentHash`/`pipelineVersion` y no usa transacción.

- [ ] **Step 3: Reescribir el servicio**

Reemplazar `backend/src/mastra/services/document-registry/index.ts` completo:

```ts
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
    await client.query("ROLLBACK");
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
      await client.query("ROLLBACK");
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
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd backend && pnpm vitest run src/mastra/services/document-registry/index.test.ts
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Verificar que nada más se rompió**

```bash
cd backend && pnpm test && pnpm lint
```

Esperado: PASS. `src/scripts/ingest.ts` va a fallar el typecheck de lint porque llama a `registerDocument` sin los campos nuevos — se arregla en la Tarea 8. Si `pnpm lint` reporta **sólo** ese archivo, seguí; cualquier otro error se arregla ahora.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mastra/services/document-registry/
git commit -m "feat(rag): registerDocument transaccional con embedding concurrente y reembedDocument"
```

---

## Task 6: CLI `corpus:sync` en modo lectura (`--dry-run`)

**Files:**
- Create: `backend/src/scripts/corpus-sync.ts`
- Modify: `backend/package.json` (scripts)

**Interfaces:**
- Consumes: `derivarDocumento`, `hashContenido` de `../mastra/services/corpus/paths.js`; `decidirAccion` de `../mastra/services/corpus/decidir.js`; `PIPELINE_VERSION` de `../mastra/config/embedding.js`; `getPool` de `../mastra/config/storage.js`.
- Produces: el ejecutable `pnpm corpus:sync`. Esta tarea implementa **sólo** el recorrido, la derivación, la decisión y el reporte. La escritura llega en la Tarea 7.

- [ ] **Step 1: Crear el script en modo lectura**

Crear `backend/src/scripts/corpus-sync.ts`:

```ts
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
```

- [ ] **Step 2: Registrar el script**

En `backend/package.json`, dentro de `"scripts"`, después de la línea de `"ingest"`:

```json
    "corpus:sync": "tsx src/scripts/corpus-sync.ts"
```

(Acordate de la coma al final de la línea anterior.)

- [ ] **Step 3: Correr el dry-run contra el corpus real**

```bash
cd backend && pnpm corpus:sync --dry-run
```

Esperado: `Corpus: 155 archivos · Base: 155 documentos`, **cero errores de derivación**, cero documentos sólo en la base. Los 155 van a aparecer como **modificados** (no como "sin cambios") porque las filas todavía tienen `contentHash` en NULL — eso es correcto en este punto y lo resuelve el `--backfill` de la Tarea 7.

Si aparece **cualquier error de derivación**, pará: significa que la derivación no reproduce la partición ya cargada. Diagnosticá antes de seguir; es exactamente el bug que esta validación existe para atrapar.

- [ ] **Step 4: Lint y commit**

```bash
cd backend && pnpm lint
git add backend/src/scripts/corpus-sync.ts backend/package.json
git commit -m "feat(rag): corpus:sync en modo lectura con reporte de plan y drift"
```

---

## Task 7: Escritura del sync (`--backfill` y ejecución real)

**Files:**
- Modify: `backend/src/scripts/corpus-sync.ts`

**Interfaces:**
- Consumes: `registerDocument`, `reembedDocument` de `../mastra/services/document-registry/index.js`.
- Produces: `pnpm corpus:sync` escribiendo de verdad, y `pnpm corpus:sync --backfill`.

**Nota de diseño:** el `--backfill` existe porque las 155 filas actuales fueron ingestadas antes de que las huellas existieran. Escribe `contentHash` y `pipelineVersion` **sin re-embeber**, asumiendo que los chunks guardados corresponden al archivo actual — asunción que verifica comparando categoría y subcategoría derivadas contra las de la fila, y que sólo aplica a filas donde ambas coinciden.

- [ ] **Step 1: Agregar la resolución del id y el upsert del Document**

En `corpus-sync.ts`, agregar antes de `main`:

```ts
/** Creates or updates the Document row (metadata only) and returns its id. */
async function upsertDocumento(doc: DocumentoDelCorpus): Promise<string> {
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
```

- [ ] **Step 2: Agregar el modo backfill**

En `corpus-sync.ts`, después de `upsertDocumento`:

```ts
/**
 * Stamps fingerprints on rows ingested before they existed, without
 * re-embedding. Only touches rows whose stored partition already matches what
 * the path derives — a mismatch means the row was not produced by this file.
 */
async function backfill(items: ItemDelSync[]): Promise<{ marcados: number; omitidos: string[] }> {
  const omitidos: string[] = [];
  let marcados = 0;

  for (const item of items) {
    if (item.fila === null) {
      omitidos.push(`${item.doc.rutaRelativa}: no existe en la base (requiere ingesta real)`);
      continue;
    }
    const { rowCount } = await getPool().query(
      `UPDATE "Document"
          SET "contentHash" = $2, "pipelineVersion" = $3, "updatedAt" = now()
        WHERE "id" = $1
          AND "categoria" IS NOT DISTINCT FROM $4
          AND "subcategoria" IS NOT DISTINCT FROM $5
          AND "status" = 'READY'::"ProcessingStatus"`,
      [item.fila.id, item.hash, PIPELINE_VERSION, item.doc.categoria, item.doc.subcategoria],
    );
    if (rowCount === 1) marcados += 1;
    else omitidos.push(`${item.doc.rutaRelativa}: la partición o el estado de la fila no coinciden con el archivo`);
  }
  return { marcados, omitidos };
}
```

- [ ] **Step 3: Agregar la ejecución del plan**

En `corpus-sync.ts`, después de `backfill`:

```ts
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
```

- [ ] **Step 4: Cablear los modos en `main`**

En `corpus-sync.ts`, reemplazar el bloque final de `main` (desde `if (values["dry-run"])` hasta el `return` que menciona la Tarea 7) por:

```ts
  if (values["dry-run"]) {
    console.log("\n--dry-run: no se escribió nada.");
    return errores.length > 0 ? 1 : 0;
  }

  if (values.backfill) {
    const { marcados, omitidos } = await backfill(items);
    console.log(`\nbackfill: ${String(marcados)} filas marcadas sin re-embeber.`);
    for (const omitido of omitidos) console.log(`  OMITIDO ${omitido}`);
    return errores.length > 0 || omitidos.length > 0 ? 1 : 0;
  }

  console.log("");
  const fallos = await ejecutar(items);
  if (fallos.length > 0) {
    console.log(`\nFALLOS (${String(fallos.length)}):`);
    for (const fallo of fallos) console.log(`  ${fallo}`);
  }
  return errores.length > 0 || fallos.length > 0 ? 1 : 0;
```

Y agregar el import al tope del archivo:

```ts
import { reembedDocument, registerDocument } from "../mastra/services/document-registry/index.js";
```

- [ ] **Step 5: Correr el backfill**

```bash
cd backend && pnpm corpus:sync --backfill
```

Esperado: `backfill: 155 filas marcadas sin re-embeber.` y **cero omitidos**. Un omitido significa que la partición derivada no coincide con la cargada — diagnosticá antes de seguir.

- [ ] **Step 6: Verificar que el sync ahora es un no-op**

```bash
cd backend && pnpm corpus:sync --dry-run
```

Esperado: `sin cambios : 155`, y `nuevos`, `modificados` y `a re-embeber` en 0. **Esta es la verificación central del plan**: prueba que la derivación reproduce exactamente lo que ya está cargado.

- [ ] **Step 7: Verificar que un cambio real se detecta**

```bash
cd backend && printf '\n\nPárrafo de prueba para el sync.\n' >> corpus/transito/generales/01-siniestro-obligaciones-vias.md
pnpm corpus:sync --dry-run
```

Esperado: `modificados : 1`, con `[reingestar] transito/generales/01-siniestro-obligaciones-vias.md`.

Revertir:

```bash
cd backend && git checkout corpus/transito/generales/01-siniestro-obligaciones-vias.md && pnpm corpus:sync --dry-run
```

Esperado: vuelve a `sin cambios : 155`.

- [ ] **Step 8: Lint y commit**

```bash
cd backend && pnpm lint && pnpm test
git add backend/src/scripts/corpus-sync.ts
git commit -m "feat(rag): escritura del corpus:sync con backfill de huellas"
```

---

## Task 8: `pnpm ingest` delega en el camino del sync

**Files:**
- Modify: `backend/src/scripts/ingest.ts` (reescritura completa)

**Interfaces:**
- Consumes: `derivarDocumento`, `hashContenido`, `PIPELINE_VERSION`, `registerDocument`.
- Produces: `pnpm ingest <archivo>` sin flags de título/categoría — los deriva del path igual que el sync.

**Nota de diseño:** hoy `ingest.ts` recibe `--title`, `--categoria` y `--subcategoria` a mano, que es de donde salieron los bugs de partición. Pasa a derivarlos, con la misma validación. Deja de aceptar archivos fuera de `backend/corpus/`: un documento del corpus vive en el corpus.

- [ ] **Step 1: Reescribir el script**

Reemplazar `backend/src/scripts/ingest.ts` completo:

```ts
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
import { derivarDocumento, hashContenido } from "../mastra/services/corpus/paths.js";
import { registerDocument } from "../mastra/services/document-registry/index.js";

const logger = makeLogger("Ingest");
const CORPUS_DIR = fileURLToPath(new URL("../../corpus", import.meta.url));

async function main(): Promise<number> {
  const { positionals } = parseArgs({ allowPositionals: true });
  const argumento = positionals[0];
  if (argumento === undefined) {
    logger.error("Uso: pnpm ingest <ruta dentro de backend/corpus>/<archivo>.md");
    return 1;
  }

  const absoluta = isAbsolute(argumento) ? argumento : resolve(process.cwd(), argumento);
  const rutaRelativa = relative(CORPUS_DIR, absoluta).split(sep).join("/");
  if (rutaRelativa.startsWith("..")) {
    logger.error("El archivo tiene que vivir dentro de backend/corpus/", { archivo: argumento });
    return 1;
  }

  const contenido = readFileSync(absoluta, "utf8");
  const doc = derivarDocumento(rutaRelativa, contenido);

  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO "Document" ("id", "title", "sourceKey", "categoria", "subcategoria", "status", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'PROCESSING'::"ProcessingStatus", now(), now())
     ON CONFLICT ("title") DO UPDATE
        SET "sourceKey" = $2, "categoria" = $3, "subcategoria" = $4,
            "status" = 'PROCESSING'::"ProcessingStatus", "updatedAt" = now()
     RETURNING "id"`,
    [doc.title, doc.rutaRelativa, doc.categoria, doc.subcategoria],
  );
  const documentId = rows[0].id;
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
```

- [ ] **Step 2: Verificar el ingest de un archivo suelto**

```bash
cd backend && pnpm ingest corpus/transito/generales/01-siniestro-obligaciones-vias.md
```

Esperado: `Ingest finished` con `chunksInserted` mayor que 0.

- [ ] **Step 3: Verificar que el sync lo ve como sin cambios**

```bash
cd backend && pnpm corpus:sync --dry-run
```

Esperado: `sin cambios : 155`. Prueba que `ingest` y `corpus:sync` escriben huellas idénticas.

- [ ] **Step 4: Actualizar la documentación de comandos**

En `CLAUDE.md`, en la sección "Comandos", reemplazar la línea del backend por:

```markdown
- Backend: `pnpm dev` (mastra dev) · `pnpm test` · `pnpm lint` · `pnpm evals [filtro]` (ej. `pnpm evals captacion`) · `pnpm corpus:sync [--dry-run]` (ingesta incremental del corpus completo) · `pnpm ingest corpus/<categoria>/<subcategoria>/<archivo>.md` (un archivo suelto; título y partición se derivan del path)
```

- [ ] **Step 5: Lint y commit**

```bash
cd backend && pnpm lint && pnpm test
git add backend/src/scripts/ingest.ts CLAUDE.md
git commit -m "refactor(rag): pnpm ingest deriva la partición del path y comparte camino con el sync"
```

---

## Task 9: Golden set de retrieval y su runner

**Files:**
- Create: `backend/src/test/retrieval/run-retrieval.ts`
- Create: `backend/src/test/retrieval/datasets/laboral.json`
- Create: `backend/src/test/retrieval/datasets/familia.json`
- Create: `backend/src/test/retrieval/datasets/arrendamiento-desalojo.json`
- Create: `backend/src/test/retrieval/datasets/relaciones-consumo.json`
- Create: `backend/src/test/retrieval/datasets/transito.json`
- Modify: `backend/src/test/run-evals.ts`

**Interfaces:**
- Consumes: `generateEmbedding`, `toVectorLiteral`, `buildSearchQuery`, `getPool`.
- Produces: `evalRetrieval(categoria: string, etiqueta: string): Promise<number>` exportada desde `run-retrieval.ts`, registrada en el array `EVALS` del runner; y `pnpm evals retrieval`.

**Nota de diseño:** el runner actual gatea todo contra un único `THRESHOLD = 0.9`, que es el del matcher de clasificación. Los evals de retrieval necesitan su propio corte, así que esta tarea agrega un `umbral` opcional por entrada de `EVALS`.

- [ ] **Step 1: Escribir el runner de retrieval**

Crear `backend/src/test/retrieval/run-retrieval.ts`:

```ts
/**
 * Eval de retrieval: mide qué devuelve el corpus, sin invocar ningún agente.
 *
 * Positivos: `esperado` lista títulos de documentos; el item pasa si alguno
 * aparece en el top-5 (el limit default del agente). Se reporta también el
 * recall@20, que no se gatea — alimenta la decisión sobre reranking.
 *
 * Negativos: `esperado` vacío afirma que la consulta no debería traer nada de
 * esa partición. El item pasa si el resultado queda estrictamente vacío tras
 * aplicar MIN_SIMILARITY. Con el umbral sin calibrar fallan todos, por
 * construcción: nada del corpus puntúa por debajo de 0,3.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { generateEmbedding, toVectorLiteral } from "../../mastra/config/embedding.js";
import { getPool } from "../../mastra/config/storage.js";
import { buildSearchQuery, MIN_SIMILARITY } from "../../mastra/tools/documentos/buscar-documentos-tool.js";

const itemSchema = z.object({
  consulta: z.string().min(1),
  categoria: z.string().min(1),
  subcategorias: z.array(z.string()).optional(),
  /** Títulos esperados. Vacío = item negativo: el resultado debe quedar vacío. */
  esperado: z.array(z.string()),
});

type ItemRetrieval = z.infer<typeof itemSchema>;

interface Recuperado {
  titulo: string;
  similarity: number;
}

async function recuperar(item: ItemRetrieval, limit: number, minSimilarity: number): Promise<Recuperado[]> {
  // Mismo régimen de embedding que buscar-documentos: si el eval embebiera la
  // consulta con un taskType que la tool no usa, mediría un sistema que no es
  // el que corre en producción. La Tarea 12 los mueve a los dos a la vez.
  const embedding = await generateEmbedding(item.consulta);
  const { sql, params } = buildSearchQuery({
    vector: toVectorLiteral(embedding),
    minSimilarity,
    limit,
    categoria: item.categoria,
    subcategorias: item.subcategorias,
  });
  const { rows } = await getPool().query<{ document_title: string; similarity: number }>(sql, params);
  return rows.map((row) => ({ titulo: row.document_title, similarity: row.similarity }));
}

/** Runs one category's dataset. Returns the gated score: recall@5 over positives, empty-rate over negatives. */
export async function evalRetrieval(categoria: string, etiqueta: string): Promise<number> {
  const datasetPath = join(dirname(fileURLToPath(import.meta.url)), `datasets/${categoria}.json`);
  const items = z.array(itemSchema).parse(JSON.parse(readFileSync(datasetPath, "utf8")) as unknown);

  const positivos = items.filter((item) => item.esperado.length > 0);
  const negativos = items.filter((item) => item.esperado.length === 0);

  let aciertos5 = 0;
  let aciertos20 = 0;
  const fallas: string[] = [];
  const similitudesDeAcierto: number[] = [];

  for (const item of positivos) {
    const top20 = await recuperar(item, 20, MIN_SIMILARITY);
    const indice = top20.findIndex((r) => item.esperado.includes(r.titulo));
    if (indice >= 0 && indice < 5) {
      aciertos5 += 1;
      similitudesDeAcierto.push(top20[indice].similarity);
    } else if (indice >= 0) {
      aciertos20 += 1;
      fallas.push(`"${item.consulta}" → esperado en posición ${String(indice + 1)}, fuera del top-5`);
    } else {
      fallas.push(`"${item.consulta}" → ninguno de [${item.esperado.join(" | ")}] en el top-20`);
    }
  }
  aciertos20 += aciertos5;

  let vacios = 0;
  const similitudesDeNegativo: number[] = [];
  for (const item of negativos) {
    const top5 = await recuperar(item, 5, MIN_SIMILARITY);
    if (top5.length === 0) vacios += 1;
    else {
      similitudesDeNegativo.push(top5[0].similarity);
      fallas.push(`"${item.consulta}" → debía quedar vacío, trajo ${String(top5.length)} a ${top5[0].similarity.toFixed(3)}`);
    }
  }

  const recall5 = positivos.length === 0 ? 1 : aciertos5 / positivos.length;
  const recall20 = positivos.length === 0 ? 1 : aciertos20 / positivos.length;
  const tasaVacio = negativos.length === 0 ? 1 : vacios / negativos.length;

  const minimo = (xs: number[]): string => (xs.length === 0 ? "n/a" : Math.min(...xs).toFixed(3));
  const maximo = (xs: number[]): string => (xs.length === 0 ? "n/a" : Math.max(...xs).toFixed(3));

  console.log(
    `\n[retrieval-${etiqueta}] recall@5=${recall5.toFixed(3)} recall@20=${recall20.toFixed(3)} ` +
      `vacío-correcto=${tasaVacio.toFixed(3)} (${String(positivos.length)} positivos, ${String(negativos.length)} negativos)`,
  );
  console.log(
    `  calibración: piso de positivos acertados=${minimo(similitudesDeAcierto)} · ` +
      `techo de negativos=${maximo(similitudesDeNegativo)}`,
  );
  for (const falla of fallas) console.log(`  FAIL: ${falla}`);

  return Math.min(recall5, tasaVacio);
}
```

- [ ] **Step 2: Exportar `MIN_SIMILARITY`**

En `backend/src/mastra/tools/documentos/buscar-documentos-tool.ts:9`, agregar `export`:

```ts
/** Minimum cosine similarity for a chunk to be considered relevant. Calibrated with src/test/retrieval. */
export const MIN_SIMILARITY = 0.3;
```

- [ ] **Step 3: Crear el dataset de arrendamiento**

Crear `backend/src/test/retrieval/datasets/arrendamiento-desalojo.json`:

```json
[
  {
    "consulta": "arriendo un campo para ganadería y el propietario me quiere echar antes del plazo",
    "categoria": "arrendamiento-desalojo",
    "subcategorias": ["arrendamiento-rural"],
    "esperado": ["Arrendamiento — Desalojo rural y entrega del predio (Decreto-Ley 14.384)"]
  },
  {
    "consulta": "mi inquilino no paga hace tres meses, cómo lo desalojo",
    "categoria": "arrendamiento-desalojo",
    "subcategorias": ["desalojo-ley-14219"],
    "esperado": ["Arrendamiento — Desalojo por mal pagador y mora (Decreto-Ley 14.219)"]
  },
  {
    "consulta": "qué garantías puedo pedir para alquilar mi apartamento",
    "categoria": "arrendamiento-desalojo",
    "subcategorias": ["contrato-de-alquiler"],
    "esperado": ["Arrendamiento — Garantías del contrato de alquiler"]
  },
  {
    "consulta": "me despidieron sin causa después de seis años de trabajo",
    "categoria": "arrendamiento-desalojo",
    "subcategorias": ["arrendamiento-rural"],
    "esperado": []
  },
  {
    "consulta": "cuál es la receta de la tortilla de papas con cebolla",
    "categoria": "arrendamiento-desalojo",
    "esperado": []
  }
]
```

**Los títulos de `esperado` tienen que existir textualmente en la base.** Verificalos antes de seguir:

```bash
cd backend && node --env-file=.env -e '
const pg = require("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
pool.query(`SELECT "title" FROM "Document" WHERE "categoria" = $1 ORDER BY 1`, ["arrendamiento-desalojo"])
  .then(r => { r.rows.forEach(x => console.log(x.title)); return pool.end(); });
'
```

Corregí los `esperado` del JSON con los títulos reales que imprima ese comando.

- [ ] **Step 4: Crear los datasets de las otras cuatro categorías**

Repetir la estructura del paso 3 para `laboral.json`, `familia.json`, `relaciones-consumo.json` y `transito.json`, con el mismo comando de verificación cambiando la categoría. Proporción objetivo (30 positivos y 10 negativos en total, según el corpus de cada una):

| dataset | positivos | negativos |
|---|---|---|
| `laboral.json` | 12 | 4 |
| `familia.json` | 8 | 3 |
| `arrendamiento-desalojo.json` | 5 | 2 |
| `relaciones-consumo.json` | 3 | 1 |
| `transito.json` | 2 | 1 |

Los negativos de cada dataset cubren las tres variedades del spec §5: uno fuera de dominio (consulta de otra categoría con este filtro), uno absurdo, y —donde el corpus lo permita— uno **dentro de la categoría pero fuera del corpus** (un tema que ese agente puede recibir y sobre el que no hay material). Este último es el que necesita revisión del equipo legal.

- [ ] **Step 5: Agregar umbral por dataset al runner**

En `backend/src/test/run-evals.ts`, cambiar el tipo del array `EVALS` y el chequeo final de `main`:

```ts
const EVALS: readonly { nombre: string; run: () => Promise<number>; umbral?: number }[] = [
```

y en `main`, reemplazar la última línea:

```ts
  const resultados: { nombre: string; precision: number; umbral: number }[] = [];
  for (const evalDef of seleccion) {
    resultados.push({ nombre: evalDef.nombre, precision: await evalDef.run(), umbral: evalDef.umbral ?? THRESHOLD });
  }
  const reprobados = resultados.filter((r) => r.precision < r.umbral);
  for (const r of reprobados) {
    console.log(`\nGATE FALLADO: ${r.nombre} — ${r.precision.toFixed(3)} < ${r.umbral.toFixed(3)}`);
  }
  return reprobados.length === 0 ? 0 : 1;
```

- [ ] **Step 6: Registrar los evals de retrieval**

En `run-evals.ts`, agregar el import:

```ts
import { evalRetrieval } from "./retrieval/run-retrieval.js";
```

y al final del array `EVALS`, antes del `];`:

```ts
  // Umbral 0 mientras se calibra MIN_SIMILARITY: los negativos fallan todos por
  // construcción hasta la Tarea 10, y un gate acá bloquearía todo el runner.
  { nombre: "retrieval-laboral", run: () => evalRetrieval("laboral", "Laboral"), umbral: 0 },
  { nombre: "retrieval-familia", run: () => evalRetrieval("familia", "Familia"), umbral: 0 },
  {
    nombre: "retrieval-arrendamiento",
    run: () => evalRetrieval("arrendamiento-desalojo", "Arrendamiento"),
    umbral: 0,
  },
  { nombre: "retrieval-consumo", run: () => evalRetrieval("relaciones-consumo", "Consumo"), umbral: 0 },
  { nombre: "retrieval-transito", run: () => evalRetrieval("transito", "Tránsito"), umbral: 0 },
```

- [ ] **Step 7: Correr el eval y registrar el baseline**

```bash
cd backend && pnpm evals retrieval 2>&1 | tee /tmp/retrieval-baseline.txt
```

Esperado: corre las cinco categorías. `recall@5` alto, `vacío-correcto = 0.000` en todas (los negativos fallan por construcción). Anotá los valores de `piso de positivos acertados` y `techo de negativos` de cada categoría — son el insumo de la Tarea 10.

Si algún positivo falla, revisá primero que el título de `esperado` esté bien escrito antes de concluir que el retrieval falla.

- [ ] **Step 8: Lint y commit**

```bash
cd backend && pnpm lint && pnpm test
git add backend/src/test/retrieval backend/src/test/run-evals.ts backend/src/mastra/tools/documentos/buscar-documentos-tool.ts
git commit -m "feat(evals): golden set de retrieval con positivos y negativos, umbral por dataset"
```

---

## Task 10: Calibrar `MIN_SIMILARITY`

**Files:**
- Modify: `backend/src/mastra/tools/documentos/buscar-documentos-tool.ts:9`
- Modify: `backend/src/test/run-evals.ts` (umbrales de los evals de retrieval)
- Modify: `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md` (registrar los números)

**Interfaces:**
- Consumes: la salida del eval de la Tarea 9.
- Produces: `MIN_SIMILARITY` calibrado y los gates de retrieval activos.

- [ ] **Step 1: Elegir el candidato**

Del baseline de la Tarea 9, tomá el mínimo de los `piso de positivos acertados` entre las cinco categorías (llamalo `P`) y el máximo de los `techo de negativos` (llamalo `N`).

- Si `N < P`: el umbral candidato es el punto medio, `(N + P) / 2`, redondeado a dos decimales.
- Si `N >= P`: las distribuciones se solapan y **no hay umbral absoluto viable**. Pará acá y aplicá el corte relativo del spec §7 en vez de este paso: agregá a `buildSearchQuery` un filtro `similarity > (mejor_similarity * FACTOR)` y calibrá `FACTOR` con el mismo procedimiento. No sigas con un absoluto que sacrifica recall.

- [ ] **Step 2: Aplicar el candidato**

En `buscar-documentos-tool.ts:9`, reemplazar el valor (ejemplo con 0,66; usá el que salga del paso 1):

```ts
/**
 * Minimum cosine similarity for a chunk to be relevant. Calibrated 2026-08-03
 * against src/test/retrieval: the floor of matched positives sat at <P> and the
 * ceiling of negatives at <N>. The old 0.3 was below the scale's floor — an
 * unrelated query still scores ~0.49 — so it never filtered anything.
 */
export const MIN_SIMILARITY = 0.66;
```

- [ ] **Step 3: Re-correr el eval con el umbral nuevo**

```bash
cd backend && pnpm evals retrieval
```

Esperado: `vacío-correcto` sube a 1.000 (o cerca) y `recall@5` **no baja** respecto del baseline. Si el recall bajó, el umbral es muy alto: bajalo hacia `N` y repetí. El criterio del spec es asimétrico — se prioriza no perder recall.

- [ ] **Step 4: Fijar los gates**

En `run-evals.ts`, reemplazar los cinco `umbral: 0` por el valor observado menos un margen de 0,05, redondeado a dos decimales (ejemplo: si todas dieron 1.000, poné `umbral: 0.9`). Actualizá el comentario:

```ts
  // Gates fijados 2026-08-03 con MIN_SIMILARITY calibrado (Tarea 10 del plan).
  // El score de cada dataset es min(recall@5, tasa de vacío correcto).
```

- [ ] **Step 5: Verificar que los evals de agente no se rompieron**

```bash
cd backend && pnpm evals citacion
```

Esperado: PASS. El umbral nuevo puede hacer que `buscar-documentos` devuelva `status: "empty"` donde antes traía chunks; este eval verifica que los agentes siguen llamando la tool.

- [ ] **Step 6: Registrar los números en el spec**

En `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md`, en la sección "§5 Golden set", donde dice que los valores de los gates se fijan con la primera corrida calibrada, agregá debajo:

```markdown
**Valores fijados el 2026-08-03**: `MIN_SIMILARITY = <valor>`. Piso de positivos acertados `<P>`, techo de negativos `<N>`. Gates de retrieval en `<valor de gate>`. Baseline previo: recall@5 `<x>`, vacío correcto 0,000.
```

- [ ] **Step 7: Commit**

```bash
cd backend && pnpm lint
git add backend/src/mastra/tools/documentos/buscar-documentos-tool.ts backend/src/test/run-evals.ts docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md
git commit -m "feat(rag): MIN_SIMILARITY calibrado con el golden set de retrieval"
```

---

## Task 11: Eval de la rama `empty` de `buscar-documentos`

**Files:**
- Modify: `backend/src/test/agents/laboral/datasets/citacion.json`

**Interfaces:**
- Consumes: el `MIN_SIMILARITY` calibrado de la Tarea 10.
- Produces: cobertura de eval del camino que antes nunca se ejercía.

**Nota de diseño:** con el umbral sin calibrar, `status: "empty"` era inalcanzable en producción. Ahora es alcanzable, y el mensaje que la tool devuelve en ese caso le dice al agente que no invente. El spec §7 lo marca como efecto de segundo orden a cubrir.

- [ ] **Step 1: Agregar el item al dataset de citación**

En `backend/src/test/agents/laboral/datasets/citacion.json`, agregar al final del array:

```json
  {
    "mensaje": "mi empleador me obliga a usar una campera con el logo de un partido político, ¿eso está permitido?",
    "esperado": { "toolCall": "buscar-documentos" }
  }
```

La consulta es laboral —el agente debe buscar— pero el corpus no la cubre, así que el resultado va a venir vacío. Verificá primero que efectivamente no la cubre: si `pnpm evals retrieval` la resolviera, elegí otro tema no cubierto.

- [ ] **Step 2: Verificar que el agente busca y no inventa**

```bash
cd backend && pnpm evals laboral-citacion
```

Esperado: PASS — el agente llama a `buscar-documentos`.

- [ ] **Step 3: Verificación manual de la respuesta**

```bash
cd backend && pnpm evals laboral-fidelidad
```

Y leé la respuesta que el agente da al item nuevo en la salida del paso 2. Debe decir que no tiene información sobre el tema y encaminar a un abogado, sin afirmar ninguna regla. Si inventa contenido, es un problema de prompt, no de retrieval: registralo como nota y seguí — el fix va por la skill `revisar-feedback-legal`, no por este plan.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/agents/laboral/datasets/citacion.json
git commit -m "test(evals): cubre la rama empty de buscar-documentos con un tema fuera del corpus"
```

---

## Task 12: Experimento `taskType`

**Files:**
- Modify: `backend/src/mastra/config/embedding.ts` (constante `EMBEDDING_TASK_TYPE`)
- Modify: `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md` (resultado)

**Interfaces:**
- Consumes: `corpus:sync --reembed-stale` de la Tarea 7, el golden set de la Tarea 9.
- Produces: la decisión de adoptar o revertir `taskType`, con los números que la respaldan.

**Nota de diseño:** avisá antes de correrlo si hay sesiones trabajando en otros worktrees — durante el re-embedding la base queda con vectores de dos espacios distintos, y aunque cada documento se actualiza en una transacción, el corpus completo tarda algunos minutos.

- [ ] **Step 1: Guardar el baseline**

```bash
cd backend && pnpm evals retrieval 2>&1 | tee /tmp/retrieval-antes-tasktype.txt
```

Anotá `recall@5`, `recall@20` y `vacío-correcto` de las cinco categorías.

- [ ] **Step 2: Cambiar el taskType**

En `backend/src/mastra/config/embedding.ts`, cambiar la constante:

```ts
export const EMBEDDING_TASK_TYPE: EmbeddingTaskType = "RETRIEVAL_DOCUMENT";
```

Las consultas se embeben con el tipo complementario. Hay que cambiar **los dos lados a la vez**, porque el eval tiene que medir el mismo régimen que corre en producción.

En `buscar-documentos-tool.ts`, dentro de `execute`:

```ts
      const queryEmbedding = await generateEmbedding(input.query, "RETRIEVAL_QUERY");
```

En `src/test/retrieval/run-retrieval.ts`, dentro de `recuperar`:

```ts
  const embedding = await generateEmbedding(item.consulta, "RETRIEVAL_QUERY");
```

- [ ] **Step 3: Confirmar que el sync detecta el corpus entero como stale**

```bash
cd backend && pnpm corpus:sync --dry-run
```

Esperado: `a re-embeber: 155`, `modificados: 0`. Si aparecen como modificados en vez de a re-embeber, el `CHUNK_FINGERPRINT` cambió sin querer — revisá que no se hayan tocado `CHUNK_SIZE` ni `CHUNK_OVERLAP`.

- [ ] **Step 4: Re-embeber el corpus**

```bash
cd backend && pnpm corpus:sync
```

Esperado: 155 líneas `re-embebido`, cero fallos. Tarda algunos minutos.

- [ ] **Step 5: Medir**

```bash
cd backend && pnpm evals retrieval 2>&1 | tee /tmp/retrieval-despues-tasktype.txt
diff /tmp/retrieval-antes-tasktype.txt /tmp/retrieval-despues-tasktype.txt
```

- [ ] **Step 6: Decidir**

- **Si `recall@5` mejora o queda igual y la separación entre el piso de positivos y el techo de negativos crece**: se adopta. Re-corré la Tarea 10 pasos 1-4 para recalibrar `MIN_SIMILARITY` sobre la escala nueva — **la escala se movió, el umbral viejo ya no aplica**.
- **Si `recall@5` empeora**: se revierte. Volvé `EMBEDDING_TASK_TYPE` a `"NINGUNO"` y `buscar-documentos` a `generateEmbedding(input.query)` sin segundo argumento, y corré `pnpm corpus:sync` otra vez para restaurar los vectores originales.

- [ ] **Step 7: Registrar el resultado en el spec**

En `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md`, al final de la sección "§7 `taskType` como experimento reversible", agregá:

```markdown
**Resultado (2026-08-03)**: <adoptado | revertido>. recall@5 <antes> → <después>, recall@20 <antes> → <después>, separación positivos/negativos <antes> → <después>. <Una línea con la conclusión.>
```

- [ ] **Step 8: Commit**

```bash
cd backend && pnpm lint && pnpm test
git add backend/src/mastra/config/embedding.ts backend/src/mastra/tools/documentos/buscar-documentos-tool.ts docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md
git commit -m "feat(rag): taskType asimétrico en embeddings, medido contra el golden set"
```

(Si se revirtió, el mensaje del commit es `docs(rag): registra el experimento de taskType y su reversión`, y el diff de código queda vacío salvo el spec.)

---

## Task 13: Decisión sobre reranking

**Files:**
- Modify: `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md`
- Modify: `CLAUDE.md` (sólo si se decide no construirlo, para cerrar el tema)

**Interfaces:**
- Consumes: `recall@5` y `recall@20` de la corrida final del golden set.
- Produces: la decisión documentada. **Esta tarea no escribe código de reranking.**

- [ ] **Step 1: Medir la brecha**

```bash
cd backend && pnpm evals retrieval
```

Calculá `recall@20 − recall@5` por categoría y el promedio ponderado por cantidad de positivos.

- [ ] **Step 2: Aplicar el criterio**

- **Brecha < 10 puntos**: el reranker no tiene nada que reordenar. Se cierra el tema (paso 3).
- **Brecha >= 10 puntos**: hay headroom. Se cierra igual **este** plan y se abre uno nuevo para el reranker, porque implica un modelo en el camino crítico del TTFT y una entrada en `frontend/src/lib/board/costos.ts`. Documentá la brecha y qué items concretos caen fuera del top-5 — son la especificación de ese plan.

- [ ] **Step 3: Registrar la decisión en el spec**

En `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md`, al final de la sección "§7 Reranking", reemplazar el bloque "Predicción registrada para verificar" por:

```markdown
**Medido (2026-08-03)**: recall@5 <x>, recall@20 <y>, brecha <y−x> puntos. Decisión: <no se construye | se abre plan aparte>. <Una línea con el porqué.> La predicción registrada al escribir el spec —que la brecha sería chica y el reranker no se justificaría— <se cumplió | no se cumplió>.
```

- [ ] **Step 4: Si se cierra el tema, dejarlo asentado**

En `CLAUDE.md`, en la lista de gotchas, agregar al final de la sección de gotchas propios:

```markdown
- Retrieval (2026-08-03): `MIN_SIMILARITY` está calibrado contra el golden set de `backend/src/test/retrieval/` — no lo muevas a ojo, corré `pnpm evals retrieval` que gatea recall@5 y tasa de vacío correcto por separado. El corpus se sincroniza con `pnpm corpus:sync` (incremental por `contentHash` + `pipelineVersion`); cambiar `chunkSize`, `overlap`, el modelo de embedding o el `taskType` mueve `PIPELINE_VERSION` y marca todo el corpus como stale, que es lo esperado. El sync NUNCA borra documentos sin archivo: la base es compartida entre los worktrees del repo. Reranking evaluado y descartado con recall@20 − recall@5 < 10pp.
```

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md CLAUDE.md
git commit -m "docs(rag): decisión sobre reranking medida con el golden set"
```

---

## Verificación final

- [ ] `cd backend && pnpm lint && pnpm test` — PASS
- [ ] `cd backend && pnpm corpus:sync --dry-run` — `sin cambios : 155`, cero errores, cero drift
- [ ] `cd backend && pnpm evals` — todos los gates en verde (incluidos los cinco de retrieval)
- [ ] `cd frontend && pnpm typecheck && pnpm lint` — PASS (el schema de Prisma cambió)
- [ ] El spec `docs/plans/2026-08-03-ingesta-incremental-y-retrieval.md` tiene registrados: los valores de calibración, el resultado del experimento de `taskType` y la decisión sobre reranking
