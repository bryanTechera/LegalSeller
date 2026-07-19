import { describe, expect, it } from "vitest";

import {
  CATEGORIAS,
  categoriaAsignableSchema,
  categoriasHabilitadas,
  subcategoriaUnicaHabilitada,
  subcategoriasHabilitadas,
} from "./registry.js";

describe("registry de dominios", () => {
  it("tiene las 4 categorías del universo", () => {
    expect(CATEGORIAS.map((c) => c.id)).toEqual([
      "laboral",
      "familia",
      "arrendamiento-desalojo",
      "relaciones-consumo",
    ]);
  });

  it("v1: solo laboral habilitada, solo despido habilitado", () => {
    expect(categoriasHabilitadas().map((c) => c.id)).toEqual(["laboral"]);
    expect(subcategoriasHabilitadas("laboral").map((s) => s.id)).toEqual(["despido"]);
    expect(subcategoriasHabilitadas("familia")).toEqual([]);
  });

  it("detecta el cortocircuito de subcategoría única", () => {
    expect(subcategoriaUnicaHabilitada("laboral")?.id).toBe("despido");
    expect(subcategoriaUnicaHabilitada("familia")).toBeNull();
  });

  it("el enum asignable incluye habilitadas y escapes, nunca deshabilitadas", () => {
    const values = categoriaAsignableSchema.options;
    expect(values).toContain("laboral");
    expect(values).toContain("fuera-de-universo");
    expect(values).toContain("categoria-no-habilitada");
    expect(values).not.toContain("familia");
  });
});
