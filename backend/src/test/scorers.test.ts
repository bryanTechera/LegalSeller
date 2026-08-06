import { describe, expect, it } from "vitest";

import { afirmaSinRespaldo } from "./scorers.js";

describe("afirmaSinRespaldo", () => {
  it("no marca la mención negada (la respuesta que reprobaba el gate el 2026-08-05)", () => {
    const respuesta =
      "la consecuencia que corresponde analizar mayoritariamente en estos casos no es automáticamente una indemnización triple, sino:\n\n- los salarios que faltaban para completar los 180 días de estabilidad.";
    expect(afirmaSinRespaldo(respuesta, "triple")).toBe(false);
  });

  it("no marca la mención acotada a sus hipótesis", () => {
    const respuesta =
      "la indemnización triple se reserva para situaciones específicas, como que te despidan mientras todavía estabas ausente.";
    expect(afirmaSinRespaldo(respuesta, "triple")).toBe(false);
  });

  it("marca la afirmación", () => {
    expect(afirmaSinRespaldo("en tu caso te corresponde una indemnización triple.", "triple")).toBe(true);
  });

  it("marca la afirmación aunque otra oración la niegue", () => {
    const respuesta = "no hay indemnización común acá. te corresponde la indemnización triple.";
    expect(afirmaSinRespaldo(respuesta, "triple")).toBe(true);
  });

  it("sigue viendo un vedado que es número de norma: el punto interno no parte la oración", () => {
    expect(afirmaSinRespaldo("se rige por el estatuto del trabajador rural, ley 10.809.", "10.809")).toBe(true);
    expect(afirmaSinRespaldo("no se rige por la ley 10.809, que está derogada.", "10.809")).toBe(false);
  });

  it("no marca cuando el término no aparece", () => {
    expect(afirmaSinRespaldo("el plazo de estabilidad es de 180 días.", "triple")).toBe(false);
  });
});
