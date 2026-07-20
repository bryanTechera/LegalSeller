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

  it("solo laboral habilitada, con despido y rubros-laborales habilitados", () => {
    expect(categoriasHabilitadas().map((c) => c.id)).toEqual(["laboral"]);
    expect(subcategoriasHabilitadas("laboral").map((s) => s.id)).toEqual(["despido", "rubros-laborales"]);
    expect(subcategoriasHabilitadas("familia")).toEqual([]);
  });

  it("el cortocircuito de subcategoría única devuelve null cuando no hay exactamente una", () => {
    expect(subcategoriaUnicaHabilitada("laboral")).toBeNull();
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
