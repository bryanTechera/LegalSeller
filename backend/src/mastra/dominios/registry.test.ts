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

  it("laboral, familia y arrendamiento-desalojo habilitadas, con sus subcategorías habilitadas", () => {
    expect(categoriasHabilitadas().map((c) => c.id)).toEqual(["laboral", "familia", "arrendamiento-desalojo"]);
    expect(subcategoriasHabilitadas("laboral").map((s) => s.id)).toEqual([
      "despido",
      "rubros-laborales",
      "trabajador-rural",
      "call-center",
      "licencias-especiales",
    ]);
    expect(subcategoriasHabilitadas("familia").map((s) => s.id)).toEqual([
      "pension-tenencia-visitas",
      "divorcio-sociedad-conyugal",
      "sucesiones",
      "union-concubinaria",
      "violencia-de-genero",
    ]);
    expect(subcategoriasHabilitadas("arrendamiento-desalojo").map((s) => s.id)).toEqual([
      "contrato-de-alquiler",
      "desalojo-ley-8153",
      "desalojo-ley-14219",
      "desalojo-ley-19889",
      "cobro-alquileres",
    ]);
    expect(subcategoriasHabilitadas("relaciones-consumo")).toEqual([]);
  });

  it("el cortocircuito de subcategoría única devuelve null cuando no hay exactamente una", () => {
    expect(subcategoriaUnicaHabilitada("laboral")).toBeNull();
    expect(subcategoriaUnicaHabilitada("familia")).toBeNull();
    expect(subcategoriaUnicaHabilitada("arrendamiento-desalojo")).toBeNull();
  });

  it("el enum asignable incluye habilitadas y escapes, nunca deshabilitadas", () => {
    const values = categoriaAsignableSchema.options;
    expect(values).toContain("laboral");
    expect(values).toContain("familia");
    expect(values).toContain("arrendamiento-desalojo");
    expect(values).toContain("fuera-de-universo");
    expect(values).toContain("categoria-no-habilitada");
    expect(values).not.toContain("relaciones-consumo");
  });
});
