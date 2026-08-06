import { describe, expect, it } from "vitest";

import {
  CATEGORIAS,
  categoriaAsignableSchema,
  categoriasHabilitadas,
  subcategoriasDeCategoriaSchema,
  subcategoriaUnicaHabilitada,
  subcategoriasHabilitadas,
} from "./registry.js";

describe("registry de dominios", () => {
  it("tiene las 6 categorías del universo (civil declarada, aún no habilitada)", () => {
    expect(CATEGORIAS.map((c) => c.id)).toEqual([
      "laboral",
      "familia",
      "transito",
      "arrendamiento-desalojo",
      "relaciones-consumo",
      "civil",
    ]);
  });

  it("las 5 categorías habilitadas, con sus subcategorías habilitadas", () => {
    expect(categoriasHabilitadas().map((c) => c.id)).toEqual([
      "laboral",
      "familia",
      "transito",
      "arrendamiento-desalojo",
      "relaciones-consumo",
    ]);
    expect(subcategoriasHabilitadas("laboral").map((s) => s.id)).toEqual([
      "despido",
      "rubros-laborales",
      "trabajador-rural",
      "call-center",
      "licencias-especiales",
      "seguro-desempleo",
      "teletrabajo",
      "plataformas-digitales",
    ]);
    expect(subcategoriasHabilitadas("familia").map((s) => s.id)).toEqual([
      "pension-tenencia-visitas",
      "divorcio-sociedad-conyugal",
      "sucesiones",
      "union-concubinaria",
      "violencia-de-genero",
    ]);
    expect(subcategoriasHabilitadas("transito")).toEqual([]);
    expect(subcategoriasHabilitadas("arrendamiento-desalojo").map((s) => s.id)).toEqual([
      "contrato-de-alquiler",
      "desalojo-ley-8153",
      "desalojo-ley-14219",
      "desalojo-ley-19889",
      "cobro-alquileres",
      "arrendamiento-rural",
    ]);
    expect(subcategoriasHabilitadas("relaciones-consumo").map((s) => s.id)).toEqual([
      "derechos-del-consumidor",
      "procedimiento-mef-judicial",
    ]);
    expect(subcategoriasHabilitadas("civil")).toEqual([]);
  });

  it("el cortocircuito de subcategoría única devuelve null cuando no hay exactamente una", () => {
    expect(subcategoriaUnicaHabilitada("laboral")).toBeNull();
    expect(subcategoriaUnicaHabilitada("familia")).toBeNull();
    expect(subcategoriaUnicaHabilitada("transito")).toBeNull();
    expect(subcategoriaUnicaHabilitada("arrendamiento-desalojo")).toBeNull();
    expect(subcategoriaUnicaHabilitada("relaciones-consumo")).toBeNull();
  });

  it("el enum asignable incluye todas las habilitadas y los escapes", () => {
    const values = categoriaAsignableSchema.options;
    expect(values).toContain("laboral");
    expect(values).toContain("familia");
    expect(values).toContain("transito");
    expect(values).toContain("arrendamiento-desalojo");
    expect(values).toContain("relaciones-consumo");
    expect(values).toContain("fuera-de-universo");
    expect(values).toContain("categoria-no-habilitada");
  });

  it("el enum de subcategorías de laboral no incluye las de arrendamiento", () => {
    const schema = subcategoriasDeCategoriaSchema("laboral");
    expect(schema).toBeDefined();
    const valores = schema?.options ?? [];
    expect(valores).toContain("despido");
    expect(valores).not.toContain("desalojo-ley-8153");
    expect(valores).not.toContain("desalojo-ley-19889");
  });

  it("devuelve undefined para una categoría sin subcategorías", () => {
    expect(subcategoriasDeCategoriaSchema("transito")).toBeUndefined();
  });
});
