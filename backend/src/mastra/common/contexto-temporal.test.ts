import { describe, expect, it } from "vitest";

import { bloqueContextoTemporal } from "./contexto-temporal.js";

describe("bloqueContextoTemporal", () => {
  it("formatea la fecha actual en es-UY dentro del tag volátil", () => {
    const bloque = bloqueContextoTemporal(new Date("2026-07-19T15:00:00-03:00"));
    expect(bloque).toContain("<contexto_temporal>");
    expect(bloque).toContain("19 de julio de 2026");
    expect(bloque).toContain("referencia temporal relativa");
  });

  it("resuelve la fecha en zona Montevideo aunque el proceso corra en UTC", () => {
    // 01:30 UTC del 20/7 sigue siendo 19/7 en Montevideo (UTC-3)
    const bloque = bloqueContextoTemporal(new Date("2026-07-20T01:30:00Z"));
    expect(bloque).toContain("19 de julio de 2026");
  });
});
