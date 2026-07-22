import { describe, expect, it } from "vitest";

import { staticSkillsRegistry } from "./index.js";

describe("staticSkillsRegistry", () => {
  it("recepcion recibe el universo de categorías (habilitadas + no cubiertas)", () => {
    const result = staticSkillsRegistry.execute(null, "recepcion");
    expect(result.activatedIds).toEqual(["universo-categorias"]);
    expect(result.inicio).toContain("<categorias_habilitadas>");
    expect(result.inicio).toContain("<temas_aun_no_cubiertos>");
    expect(result.inicio).toContain("laboral");
  });

  it("laboral recibe sus subcategorías habilitadas y las guías de dimensionamiento", () => {
    const result = staticSkillsRegistry.execute(null, "laboral");
    expect(result.activatedIds).toEqual(["subcategorias-laboral", "dimensionar-despido", "dimensionar-rubros"]);
    expect(result.inicio).toContain("<subcategorias>");
    expect(result.inicio).toContain("despido");
    expect(result.inicio).toContain("rubros-laborales");
    expect(result.inicio).toContain("<dimensionar_despido>");
    expect(result.inicio).toContain("<dimensionar_rubros>");
    expect(result.inicio).toContain("buscar-documentos");
  });

  it("familia recibe sus subcategorías habilitadas y la guía de dimensionamiento", () => {
    const result = staticSkillsRegistry.execute(null, "familia");
    expect(result.activatedIds).toEqual(["subcategorias-familia", "dimensionar-familia"]);
    expect(result.inicio).toContain("<subcategorias>");
    expect(result.inicio).toContain("pension-tenencia-visitas");
    expect(result.inicio).toContain("violencia-de-genero");
    expect(result.inicio).toContain("<dimensionar_familia>");
    expect(result.inicio).toContain("buscar-documentos");
  });

  it("recepcion no recibe las guías de dimensionamiento de las categorías", () => {
    const result = staticSkillsRegistry.execute(null, "recepcion");
    expect(result.activatedIds).not.toContain("dimensionar-despido");
    expect(result.activatedIds).not.toContain("dimensionar-rubros");
    expect(result.activatedIds).not.toContain("dimensionar-familia");
  });

  it("laboral no recibe las skills de familia ni al revés", () => {
    expect(staticSkillsRegistry.execute(null, "laboral").activatedIds).not.toContain("subcategorias-familia");
    expect(staticSkillsRegistry.execute(null, "familia").activatedIds).not.toContain("subcategorias-laboral");
  });
});
