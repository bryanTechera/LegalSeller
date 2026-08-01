import { describe, expect, it } from "vitest";

import { buildRecepcionInstructions } from "./instructions.js";

describe("instrucciones del receptor global", () => {
  const prompt = buildRecepcionInstructions(null);

  it("ofrece las categorías habilitadas y los escapes", () => {
    expect(prompt).toContain("laboral");
    expect(prompt).toContain("familia:");
    expect(prompt).toContain("transito:");
    expect(prompt).toContain("arrendamiento-desalojo:");
    expect(prompt).toContain("relaciones-consumo:");
    expect(prompt).toContain("fuera-de-universo");
    expect(prompt).toContain("categoria-no-habilitada");
  });

  it("fija el presupuesto de preguntas y el fast-path", () => {
    expect(prompt).toMatch(/máximo 2 preguntas/i);
    expect(prompt).toMatch(/sin escribir texto/i);
  });

  it("antepone el chequeo de caso sensible al triage", () => {
    const sensibleIdx = prompt.indexOf("<caso_sensible>");
    const triageIdx = prompt.indexOf("<mision>");
    expect(sensibleIdx).toBeGreaterThan(-1);
    expect(sensibleIdx).toBeLessThan(triageIdx);
  });
});
