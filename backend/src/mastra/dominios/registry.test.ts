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

  it("laboral, familia y relaciones-consumo habilitadas, con sus subcategorías habilitadas", () => {
    expect(categoriasHabilitadas().map((c) => c.id)).toEqual(["laboral", "familia", "relaciones-consumo"]);
    expect(subcategoriasHabilitadas("laboral").map((s) => s.id)).toEqual([
      "despido",
      "rubros-laborales",
      "trabajador-rural",
      "call-center",
    ]);
    expect(subcategoriasHabilitadas("familia").map((s) => s.id)).toEqual([
      "pension-tenencia-visitas",
      "divorcio-sociedad-conyugal",
      "sucesiones",
      "union-concubinaria",
      "violencia-de-genero",
    ]);
    expect(subcategoriasHabilitadas("relaciones-consumo").map((s) => s.id)).toEqual([
      "derechos-del-consumidor",
      "procedimiento-mef-judicial",
    ]);
    expect(subcategoriasHabilitadas("arrendamiento-desalojo")).toEqual([]);
  });

  it("el cortocircuito de subcategoría única devuelve null cuando no hay exactamente una", () => {
    expect(subcategoriaUnicaHabilitada("laboral")).toBeNull();
    expect(subcategoriaUnicaHabilitada("familia")).toBeNull();
    expect(subcategoriaUnicaHabilitada("relaciones-consumo")).toBeNull();
  });

  it("el enum asignable incluye habilitadas y escapes, nunca deshabilitadas", () => {
    const values = categoriaAsignableSchema.options;
    expect(values).toContain("laboral");
    expect(values).toContain("familia");
    expect(values).toContain("fuera-de-universo");
    expect(values).toContain("categoria-no-habilitada");
    expect(values).not.toContain("arrendamiento-desalojo");
  });
});
