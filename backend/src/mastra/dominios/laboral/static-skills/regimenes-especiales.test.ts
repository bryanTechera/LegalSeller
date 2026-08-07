import { describe, expect, it } from "vitest";

import { buildLaboralInstructions } from "../instructions.js";

import { regimenesEspecialesSkill } from "./regimenes-especiales.js";

describe("skill regimenes-especiales", () => {
  it("se activa solo para el agente laboral", () => {
    expect(regimenesEspecialesSkill(null, "laboral")).toContain("<regimenes_especiales>");
    expect(regimenesEspecialesSkill(null, "recepcion")).toBeNull();
    expect(regimenesEspecialesSkill(null, "familia")).toBeNull();
  });

  it("cubre los cinco regímenes habilitados y los deja ensamblados en el prompt laboral", () => {
    const prompt = buildLaboralInstructions(null);
    expect(prompt).toContain("<regimenes_especiales>");
    // Las subcategorías nuevas llegan al prompt vía la skill subcategorias-laboral (registry).
    expect(prompt).toContain("trabajador-rural");
    expect(prompt).toContain("call-center");
    expect(prompt).toContain("teletrabajo");
    expect(prompt).toContain("plataformas-digitales");
    expect(prompt).toContain("trabajo-domestico");
  });

  it("no embebe números normativos que pertenecen al corpus (dato temporal)", () => {
    const contenido = regimenesEspecialesSkill(null, "laboral") ?? "";
    expect(contenido).not.toContain("39 horas");
    expect(contenido).not.toContain("20 días");
    expect(contenido).not.toContain("48 horas");
    expect(contenido).not.toContain("8 horas");
  });
});
