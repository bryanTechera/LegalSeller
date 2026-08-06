import { describe, expect, it } from "vitest";

import { CRITICAL_RULE_IDS, rulesRegistry } from "./index.js";

describe("rulesRegistry", () => {
  it("recepcion activa identidad, caso sensible, misión y conducción — en ese orden", () => {
    const result = rulesRegistry.execute(null, "recepcion");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "caso-sensible",
      "confidencialidad-sistema",
      "mision-clasificacion",
      "conduccion-triage",
    ]);
    expect(result.final).toBe("");
  });

  it("laboral activa identidad, rol, conducta y captación (final)", () => {
    const result = rulesRegistry.execute(null, "laboral");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "confidencialidad-sistema",
      "rol-especialista-laboral",
      "conducta-laboral",
      "captacion-caso",
    ]);
    expect(result.final).toContain("<captacion>");
    expect(result.inicio).not.toContain("<captacion>");
  });

  it("familia activa identidad, caso sensible, rol, conducta y captación (final)", () => {
    const result = rulesRegistry.execute(null, "familia");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "caso-sensible",
      "confidencialidad-sistema",
      "rol-especialista-familia",
      "conducta-familia",
      "captacion-caso",
    ]);
    expect(result.final).toContain("<captacion>");
    expect(result.inicio).toContain("<caso_sensible>");
    expect(result.inicio).not.toContain("asignar-clasificacion"); // la versión del especialista no clasifica
  });

  it("transito activa identidad, rol, conducta y captación (final) — sin protocolo sensible propio", () => {
    const result = rulesRegistry.execute(null, "transito");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "confidencialidad-sistema",
      "rol-especialista-transito",
      "conducta-transito",
      "captacion-caso",
    ]);
    expect(result.final).toContain("<captacion>");
    expect(result.inicio).not.toContain("<caso_sensible>");
  });

  it("arrendamiento-desalojo activa identidad, rol, conducta y captación (final)", () => {
    const result = rulesRegistry.execute(null, "arrendamiento-desalojo");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "confidencialidad-sistema",
      "rol-especialista-arrendamiento",
      "conducta-arrendamiento",
      "captacion-caso",
    ]);
    expect(result.final).toContain("<captacion>");
    expect(result.inicio).not.toContain("<caso_sensible>"); // sin protocolo diferencial definido por el equipo legal
  });

  it("relaciones-consumo activa identidad, rol, conducta y captación (final), sin caso sensible propio", () => {
    const result = rulesRegistry.execute(null, "relaciones-consumo");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "confidencialidad-sistema",
      "rol-especialista-consumo",
      "conducta-consumo",
      "captacion-caso",
    ]);
    expect(result.final).toContain("<captacion>");
    expect(result.inicio).not.toContain("<caso_sensible>"); // el protocolo sensible queda en el receptor
  });

  it("las rules críticas son las del spec", () => {
    expect(CRITICAL_RULE_IDS).toEqual([
      "identidad-jurco",
      "caso-sensible",
      "confidencialidad-sistema",
      "conducta-laboral",
      "conducta-familia",
      "conducta-transito",
      "conducta-arrendamiento",
      "conducta-consumo",
    ]);
  });
});
