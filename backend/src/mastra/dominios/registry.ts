import { z } from "zod";

import { arrendamientoDesalojoClasificacion } from "./arrendamiento-desalojo/clasificacion.js";
import { familiaClasificacion } from "./familia/clasificacion.js";
import { laboralClasificacion } from "./laboral/clasificacion.js";
import { relacionesConsumoClasificacion } from "./relaciones-consumo/clasificacion.js";
import { transitoClasificacion } from "./transito/clasificacion.js";

/**
 * Single source of truth for the domain taxonomy wiring (spec
 * docs/plans/2026-07-19-arquitectura-agentes-clasificacion.md §5).
 * Enabling a subcategory = its folder + an entry here. Disabled categories
 * keep their data inline until they gain an agent folder.
 */
export type CategoriaId = "laboral" | "familia" | "transito" | "arrendamiento-desalojo" | "relaciones-consumo" | "civil";
export type ClasificacionEscape = "fuera-de-universo" | "categoria-no-habilitada";

export interface SubcategoriaDef {
  id: string;
  nombre: string;
  descripcion: string;
  habilitada: boolean;
}

export interface CategoriaDef {
  id: CategoriaId;
  nombre: string;
  descripcion: string;
  seniales: string[];
  habilitada: boolean;
  subcategorias: SubcategoriaDef[];
}

export const CLASIFICACION_ESCAPES = ["fuera-de-universo", "categoria-no-habilitada"] as const;

export const CATEGORIAS: readonly CategoriaDef[] = [
  laboralClasificacion,
  familiaClasificacion,
  transitoClasificacion,
  arrendamientoDesalojoClasificacion,
  relacionesConsumoClasificacion,
  {
    // Área declarada, aún sin agente ni corpus (Q&A del Código Civil, 2026-08-03):
    // el receptor la reconoce como tema no cubierto y capta el contacto. Partición
    // en subcategorías pendiente del equipo legal (docs/preguntas-legales/2026-08-03).
    id: "civil",
    nombre: "Civil",
    descripcion:
      "Derecho civil patrimonial: responsabilidad por daños entre particulares — incluido quien es demandado porque un dependiente o empleado suyo causó un daño a un tercero — y contratos entre particulares (compraventa de usados entre personas, aun por Mercado Libre o redes; préstamos; incumplimientos) con sus daños y perjuicios. No comprende los asuntos de familia (divorcio, filiación, sociedad conyugal), que van en la categoría familia, ni los reclamos a comercios y empresas, que van en relaciones-consumo.",
    seniales: [],
    habilitada: false,
    subcategorias: [],
  },
];

export function categoriasHabilitadas(): CategoriaDef[] {
  return CATEGORIAS.filter((c) => c.habilitada);
}

export function subcategoriasHabilitadas(categoriaId: CategoriaId): SubcategoriaDef[] {
  const categoria = CATEGORIAS.find((c) => c.id === categoriaId);
  if (!categoria?.habilitada) return [];
  return categoria.subcategorias.filter((s) => s.habilitada);
}

export function subcategoriaUnicaHabilitada(categoriaId: CategoriaId): SubcategoriaDef | null {
  const habilitadas = subcategoriasHabilitadas(categoriaId);
  return habilitadas.length === 1 ? habilitadas[0] : null;
}

function nonEmptyEnum(values: string[], label: string): [string, ...string[]] {
  if (values.length === 0) throw new Error(`Registry produced an empty enum for ${label}`);
  return values as [string, ...string[]];
}

/** Values the receptor may assign: enabled categories + escapes. */
export const categoriaAsignableSchema = z.enum(
  nonEmptyEnum([...categoriasHabilitadas().map((c) => c.id), ...CLASIFICACION_ESCAPES], "categorias"),
);

/** All enabled subcategory ids across categories (for the optional fast-path field). */
export const subcategoriaAsignableSchema = z.enum(
  nonEmptyEnum(
    categoriasHabilitadas().flatMap((c) => subcategoriasHabilitadas(c.id).map((s) => s.id)),
    "subcategorias",
  ),
);

/**
 * Subcategorías de UNA categoría. `registrar-caso` de cada especialista usa
 * esta versión: el enum global mete los ids de todas las categorías —incluidos
 * los que llevan número de ley— en el inputSchema de cada agente, que es un
 * volcado de la taxonomía recitable sin invocar ninguna tool.
 * `undefined` cuando la categoría no tiene subcategorías en v1.
 */
export function subcategoriasDeCategoriaSchema(
  categoriaId: string,
): z.ZodEnum<[string, ...string[]]> | undefined {
  const ids = subcategoriasHabilitadas(categoriaId as CategoriaId).map((s) => s.id);
  if (ids.length === 0) return undefined;
  return z.enum(nonEmptyEnum(ids, `subcategorias de ${categoriaId}`));
}
