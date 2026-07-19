import { describe, expect, it } from "vitest";

import { CRITICAL_RULE_IDS, rulesRegistry } from "./index.js";

describe("rulesRegistry", () => {
  it("recepcion activa identidad, caso sensible, misión y conducción — en ese orden", () => {
    const result = rulesRegistry.execute(null, "recepcion");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "caso-sensible",
      "mision-clasificacion",
      "conduccion-triage",
    ]);
    expect(result.final).toBe("");
  });

  it("laboral activa identidad, rol, conducta y captación (final)", () => {
    const result = rulesRegistry.execute(null, "laboral");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "rol-especialista-laboral",
      "conducta-laboral",
      "captacion-caso",
    ]);
    expect(result.final).toContain("<captacion>");
    expect(result.inicio).not.toContain("<captacion>");
  });

  it("las rules críticas son las del spec", () => {
    expect(CRITICAL_RULE_IDS).toEqual(["identidad-jurco", "caso-sensible", "conducta-laboral"]);
  });
});
