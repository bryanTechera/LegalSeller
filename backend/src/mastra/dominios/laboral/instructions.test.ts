import { describe, expect, it } from "vitest";

import { buildLaboralInstructions } from "./instructions.js";

describe("instrucciones del agente laboral", () => {
  it("compone persona y venta, y mantiene las reglas de citas", () => {
    const prompt = buildLaboralInstructions(null);
    expect(prompt).toContain("<personalidad>");
    expect(prompt).toContain("<captacion>");
    expect(prompt).toMatch(/cit[áa]/i);
    expect(prompt).toContain("buscar-documentos");
  });

  it("inyecta el brief del receptor cuando viene en el contexto", () => {
    const prompt = buildLaboralInstructions({ userId: "s1", casoBrief: "Despido sin liquidación." });
    expect(prompt).toContain("Despido sin liquidación.");
  });

  it("nivel 2 colapsado: instruye determinar y registrar la subcategoría", () => {
    const prompt = buildLaboralInstructions(null);
    expect(prompt).toContain("registrar-caso");
    expect(prompt).toContain("despido");
  });
});
