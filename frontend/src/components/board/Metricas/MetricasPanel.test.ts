import { describe, expect, it } from "vitest";

import type { UsoModelo } from "@/lib/board/metricas-agente";

import { costoTotal } from "./MetricasPanel";

function modelo(overrides: Partial<UsoModelo>): UsoModelo {
  return { modelo: "gemini-3-flash", tokensEntrada: 0, tokensSalida: 0, costoUsd: 1, ...overrides };
}

describe("costoTotal", () => {
  it("sin modelos en el rango, no hay total", () => {
    expect(costoTotal([])).toBe("—");
  });

  it("todos los modelos conocidos, total exacto sin marca de parcial", () => {
    expect(
      costoTotal([modelo({ modelo: "gemini-3-flash", costoUsd: 1.5 }), modelo({ modelo: "gemini-embedding-001", costoUsd: 0.5 })]),
    ).toBe("USD 2.00");
  });

  it("mezcla de modelos conocidos y desconocidos, total parcial sobre los conocidos", () => {
    expect(
      costoTotal([modelo({ modelo: "gemini-3-flash", costoUsd: 1.5 }), modelo({ modelo: "openai/gpt-9", costoUsd: null })]),
    ).toBe("USD 1.50 (parcial)");
  });

  // El bug real: sum([]) da 0, y "USD 0.00 (parcial)" se lee como gasto real
  // en vez de "no tenemos precio para nada de lo que corrió" — exactamente
  // el escenario que produce un swap de modelo (spec §4.4).
  it("todos los modelos sin precio conocido devuelve sin dato, no USD 0.00", () => {
    expect(costoTotal([modelo({ modelo: "openai/gpt-9", tokensEntrada: 100, tokensSalida: 100, costoUsd: null })])).toBe(
      "sin dato",
    );
  });

  it("varios modelos, todos sin precio conocido, también sin dato", () => {
    expect(
      costoTotal([modelo({ modelo: "openai/gpt-9", costoUsd: null }), modelo({ modelo: "anthropic/claude-x", costoUsd: null })]),
    ).toBe("sin dato");
  });
});
