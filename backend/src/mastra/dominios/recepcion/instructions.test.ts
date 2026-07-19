import { describe, expect, it } from "vitest";

import { buildRecepcionInstructions } from "./instructions.js";

describe("instrucciones del receptor global", () => {
  const prompt = buildRecepcionInstructions(null);

  it("solo ofrece las categorías habilitadas y los escapes", () => {
    expect(prompt).toContain("laboral");
    expect(prompt).toContain("fuera-de-universo");
    expect(prompt).toContain("categoria-no-habilitada");
    expect(prompt).not.toContain("familia:"); // disabled categories are not offered as options
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
