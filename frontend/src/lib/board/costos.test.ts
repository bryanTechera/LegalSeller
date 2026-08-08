import { describe, expect, it } from "vitest";

import { estimarCostoUsd } from "./costos";

describe("estimarCostoUsd", () => {
  it("calcula el costo del modelo de los agentes de categoría", () => {
    // gpt-5.6-luna: 0.20 USD por millón de entrada, 1.20 por millón de salida.
    expect(estimarCostoUsd("openai/gpt-5.6-luna", 1_000_000, 1_000_000)).toBeCloseTo(1.4, 5);
  });

  it("calcula el costo del modelo del receptor", () => {
    // gemini-3.5-flash-lite: 0.30 USD por millón de entrada, 2.50 por millón de salida.
    expect(estimarCostoUsd("google/gemini-3.5-flash-lite", 1_000_000, 1_000_000)).toBeCloseTo(2.8, 5);
  });

  // El board calcula sobre un rango temporal: uno que abarque el día del cambio
  // de modelo trae spans de los dos. Si el precio viejo se borrara, ese tramo
  // pasaría a "sin dato" y el total del período quedaría marcado como parcial.
  it("los modelos anteriores conservan su precio para el costo histórico", () => {
    expect(estimarCostoUsd("google/gemini-3.6-flash", 1_000_000, 1_000_000)).toBeCloseTo(9, 5);
    expect(estimarCostoUsd("google/gemini-3-flash", 1_000_000, 1_000_000)).toBeCloseTo(2.8, 5);
  });

  it("acepta el id de modelo sin el prefijo del proveedor", () => {
    expect(estimarCostoUsd("gpt-5.6-luna", 1_000_000, 0)).toBeCloseTo(0.2, 5);
  });

  // Un modelo desconocido debe reportar "sin dato", NUNCA costo cero: si algún
  // día se cambia de modelo, un 0 silencioso se lee como "es gratis".
  it("modelo desconocido devuelve null, no cero", () => {
    expect(estimarCostoUsd("openai/gpt-9", 1_000_000, 1_000_000)).toBeNull();
  });

  it("cero tokens con modelo conocido cuesta cero", () => {
    expect(estimarCostoUsd("openai/gpt-5.6-luna", 0, 0)).toBe(0);
  });

  it("conoce el precio del modelo del rol de síntesis", () => {
    // El rol vive en backend/src/mastra/config/modelos.ts (MODELO_SINTESIS).
    expect(estimarCostoUsd("google/gemini-3.5-flash-lite", 1_000_000, 0)).toBeCloseTo(0.3);
  });
});
