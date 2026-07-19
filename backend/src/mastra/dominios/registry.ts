import { z } from "zod";

import { laboralClasificacion } from "./laboral/clasificacion.js";

/**
 * Single source of truth for the domain taxonomy wiring (spec
 * docs/plans/2026-07-19-arquitectura-agentes-clasificacion.md §5).
 * Enabling a subcategory = its folder + an entry here. Disabled categories
 * keep their data inline until they gain an agent folder.
 */
export type CategoriaId = "laboral" | "familia" | "arrendamiento-desalojo" | "relaciones-consumo";
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
  {
    id: "familia",
    nombre: "Familia",
    descripcion: "Pensión alimenticia, tenencia y visitas, divorcio, sucesiones, unión concubinaria, violencia de género.",
    seniales: ["Menciona hijos, pareja, ex pareja, herencia o divorcio"],
    habilitada: false,
    subcategorias: [
      { id: "pension-tenencia-visitas", nombre: "Pensión alimenticia, tenencia y visitas", descripcion: "", habilitada: false },
      { id: "divorcio-sociedad-conyugal", nombre: "Divorcio, sociedad conyugal", descripcion: "", habilitada: false },
      { id: "sucesiones", nombre: "Sucesiones", descripcion: "", habilitada: false },
      { id: "union-concubinaria", nombre: "Unión concubinaria", descripcion: "", habilitada: false },
      { id: "violencia-de-genero", nombre: "Violencia de género", descripcion: "", habilitada: false },
    ],
  },
  {
    id: "arrendamiento-desalojo",
    nombre: "Arrendamiento y desalojo",
    descripcion: "Contratos de alquiler, desalojos (leyes 8153, 14219, 19980), cobro de alquileres.",
    seniales: ["Menciona alquiler, inquilino, propietario, desalojo o garantía"],
    habilitada: false,
    subcategorias: [
      { id: "contrato-de-alquiler", nombre: "Contrato de alquiler", descripcion: "", habilitada: false },
      { id: "desalojo-ley-8153", nombre: "Desalojo ley 8153", descripcion: "", habilitada: false },
      { id: "desalojo-ley-14219", nombre: "Desalojo ley 14219", descripcion: "", habilitada: false },
      { id: "desalojo-ley-19980", nombre: "Desalojo ley 19980", descripcion: "", habilitada: false },
      { id: "cobro-alquileres", nombre: "Cobro alquileres", descripcion: "", habilitada: false },
    ],
  },
  {
    id: "relaciones-consumo",
    nombre: "Relaciones de consumo",
    descripcion: "Derechos del consumidor, reclamos ante el MEF y el poder judicial.",
    seniales: ["Menciona una compra, un servicio contratado, una garantía o un reclamo a una empresa"],
    habilitada: false,
    subcategorias: [
      { id: "derechos-del-consumidor", nombre: "Derechos del consumidor", descripcion: "", habilitada: false },
      { id: "procedimiento-mef-judicial", nombre: "Procedimiento ante MEF y poder judicial", descripcion: "", habilitada: false },
    ],
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
