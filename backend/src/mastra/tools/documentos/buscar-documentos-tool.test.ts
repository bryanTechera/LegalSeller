import { describe, expect, it } from "vitest";

import { categoriasHabilitadas } from "../../dominios/registry.js";

import {
  buildSearchQuery,
  CATEGORIAS_CALIBRADAS,
  categoriaSinCalibrar,
  minSimilarityPara,
  searchDocumentsTool,
} from "./buscar-documentos-tool.js";

describe("buscar-documentos — vocabulario que ve el modelo", () => {
  it("la description no usa el léxico que las rules prohíben pronunciar", () => {
    const description = searchDocumentsTool.description;
    expect(description.toLowerCase()).not.toContain("corpus");
    expect(description.toLowerCase()).not.toContain("documentos legales");
  });
});

describe("buildSearchQuery", () => {
  it("sin filtro: no agrega condiciones de partición", () => {
    const { sql, params } = buildSearchQuery({ vector: "[1,2]", minSimilarity: 0.3, limit: 5 });
    expect(sql).not.toContain('"categoria"');
    expect(params).toHaveLength(3);
  });

  it("con categoría y subcategorías: filtra por ambas", () => {
    const { sql, params } = buildSearchQuery({
      vector: "[1,2]",
      minSimilarity: 0.3,
      limit: 5,
      categoria: "laboral",
      subcategorias: ["despido"],
    });
    expect(sql).toContain('d."categoria" = $4');
    expect(sql).toContain('d."subcategoria" = ANY($5)');
    expect(params).toEqual(["[1,2]", 0.3, 5, "laboral", ["despido"]]);
  });

  it("con filtro de subcategorías: incluye también el corpus transversal (subcategoria NULL)", () => {
    // Cross-cutting corpus (prescripción, proceso laboral) se ingiere a nivel
    // categoría con subcategoria NULL y debe seguir en alcance aunque el agente
    // filtre por sus subcategorías concretas.
    const { sql } = buildSearchQuery({
      vector: "[1,2]",
      minSimilarity: 0.3,
      limit: 5,
      categoria: "laboral",
      subcategorias: ["despido", "rubros-laborales"],
    });
    expect(sql).toContain('d."subcategoria" IS NULL');
    expect(sql).toContain('(d."subcategoria" = ANY($5) OR d."subcategoria" IS NULL)');
  });
});

describe("minSimilarityPara", () => {
  it("devuelve el umbral calibrado de cada categoría (Tarea 10, 2026-08-04)", () => {
    expect(minSimilarityPara("laboral")).toBe(0.717);
    expect(minSimilarityPara("familia")).toBe(0.678);
    expect(minSimilarityPara("arrendamiento-desalojo")).toBe(0.686);
    expect(minSimilarityPara("relaciones-consumo")).toBe(0.645);
    expect(minSimilarityPara("transito")).toBe(0.678);
  });

  it("sin categoría: usa el default (el más bajo de los cinco)", () => {
    expect(minSimilarityPara(undefined)).toBe(0.645);
    expect(minSimilarityPara()).toBe(0.645);
  });

  it("categoría desconocida: cae al mismo default, no revienta", () => {
    expect(minSimilarityPara("categoria-inexistente")).toBe(0.645);
  });
});

describe("MIN_SIMILARITY_POR_CATEGORIA cobertura", () => {
  it("toda categoría habilitada del registry tiene un umbral calibrado", () => {
    // Guarda contra el modo de falla real: habilitar una categoría nueva en el
    // registry sin calibrar su umbral la deja cayendo en silencio al default
    // de relaciones-consumo — sin este test, ni pnpm test ni pnpm evals lo detectan.
    for (const categoria of categoriasHabilitadas()) {
      expect(CATEGORIAS_CALIBRADAS).toContain(categoria.id);
    }
  });
});

describe("categoriaSinCalibrar", () => {
  it("categoría explícita fuera del mapa: true (la anomalía a loguear)", () => {
    expect(categoriaSinCalibrar("categoria-inexistente")).toBe(true);
  });

  it("sin categoría: false — llamado legítimo sin partición, no es una anomalía", () => {
    expect(categoriaSinCalibrar(undefined)).toBe(false);
  });

  it("las cinco categorías calibradas: false", () => {
    expect(categoriaSinCalibrar("laboral")).toBe(false);
    expect(categoriaSinCalibrar("familia")).toBe(false);
    expect(categoriaSinCalibrar("arrendamiento-desalojo")).toBe(false);
    expect(categoriaSinCalibrar("relaciones-consumo")).toBe(false);
    expect(categoriaSinCalibrar("transito")).toBe(false);
  });
});
