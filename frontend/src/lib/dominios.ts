import "server-only";

import { z } from "zod";

import { getMastraBaseUrl } from "./agent-service";

const dominiosSchema = z.object({
  categorias: z.array(
    z.object({ id: z.string(), nombre: z.string(), subcategoriasHabilitadas: z.array(z.string()) }),
  ),
});

export type DominioHabilitado = z.infer<typeof dominiosSchema>["categorias"][number];

const CACHE_TTL_MS = 60_000;
let cache: { at: number; value: DominioHabilitado[] } | null = null;

/** Enabled domains from the backend registry (GET /dominios), cached in-process. */
export async function getDominios(): Promise<DominioHabilitado[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const response = await fetch(`${getMastraBaseUrl()}/dominios`);
  if (!response.ok) throw new Error(`GET /dominios responded ${response.status}`);
  const parsed = dominiosSchema.parse(await response.json());
  cache = { at: Date.now(), value: parsed.categorias };
  return parsed.categorias;
}

export async function esCategoriaHabilitada(id: string): Promise<boolean> {
  return (await getDominios()).some((c) => c.id === id);
}

/** Degenerate-level shortcut (spec §5): single enabled subcategory → auto-assign. */
export async function subcategoriaUnica(categoriaId: string): Promise<string | null> {
  const categoria = (await getDominios()).find((c) => c.id === categoriaId);
  if (!categoria) return null;
  return categoria.subcategoriasHabilitadas.length === 1 ? categoria.subcategoriasHabilitadas[0] : null;
}

export function invalidateDominiosCache(): void {
  cache = null;
}
