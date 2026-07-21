import { describe, expect, it } from "vitest";

import { buildSearchQuery } from "./buscar-documentos-tool.js";

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
