import { describe, expect, it } from "vitest";

import { captacionCasoRule } from "./captacion-caso.js";

describe("captacionCasoRule", () => {
  it("sin pedido previo instruye el pedido único de contacto", () => {
    const content = captacionCasoRule({ userId: "s1" }, "laboral");
    expect(content).toContain("una sola vez");
    expect(content).not.toContain("ya se hizo");
  });

  it("con pedidoContactoHecho instruye cerrar sin mencionar el contacto", () => {
    const content = captacionCasoRule({ userId: "s1", pedidoContactoHecho: true }, "laboral");
    expect(content).toContain("ya se hizo");
    expect(content).not.toContain("una sola vez");
  });

  it("sin ReadOnlyState (startup) devuelve la variante base", () => {
    const content = captacionCasoRule(null, "familia");
    expect(content).toContain("una sola vez");
  });

  it("no aplica al receptor", () => {
    expect(captacionCasoRule({ userId: "s1" }, "recepcion")).toBeNull();
  });
});
