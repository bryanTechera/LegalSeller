import { categoriasHabilitadas, subcategoriasHabilitadas } from "./registry.js";

export interface DominiosPayload {
  categorias: { id: string; nombre: string; subcategoriasHabilitadas: string[] }[];
}

/** Payload for the custom route the BFF consumes server-side (spec §5). */
export function buildDominiosPayload(): DominiosPayload {
  return {
    categorias: categoriasHabilitadas().map((c) => ({
      id: c.id,
      nombre: c.nombre,
      subcategoriasHabilitadas: subcategoriasHabilitadas(c.id).map((s) => s.id),
    })),
  };
}
