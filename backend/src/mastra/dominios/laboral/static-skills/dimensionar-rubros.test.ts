import { describe, expect, it } from "vitest";

import { buildLaboralInstructions } from "../instructions.js";

import { dimensionarRubrosSkill } from "./dimensionar-rubros.js";

describe("skill dimensionar-rubros", () => {
  it("se activa solo para el agente laboral", () => {
    expect(dimensionarRubrosSkill(null, "laboral")).toContain("<dimensionar_rubros>");
    expect(dimensionarRubrosSkill(null, "recepcion")).toBeNull();
  });

  it("queda ensamblada en el prompt del laboral junto a la subcategoría habilitada", () => {
    const prompt = buildLaboralInstructions(null);
    expect(prompt).toContain("<dimensionar_rubros>");
    expect(prompt).toContain("rubros-laborales");
  });
});
