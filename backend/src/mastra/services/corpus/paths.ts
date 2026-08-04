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
