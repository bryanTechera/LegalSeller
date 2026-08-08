import { describe, expect, it } from "vitest";

import { sintesisSchema } from "./sintesis-schema";

describe("sintesisSchema (espejo del backend)", () => {
  const base = {
    situacion: "Lo despidieron sin causa.",
    hechos: [{ cuando: "2026-07-15", que: "Le comunicaron la desvinculación." }],
    datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
    pedido: "Saber qué le corresponde.",
    faltantes: [],
  };

  it("acepta la forma completa", () => {
    expect(sintesisSchema.parse(base).datosClave).toHaveLength(1);
  });

  // Tolerante en los opcionales, estricto en la forma: la respuesta cruza una
  // frontera HTTP y puede venir de cualquiera de las dos familias de modelo.
  it("normaliza `cuando` ausente o null a null", () => {
    expect(sintesisSchema.parse({ ...base, hechos: [{ que: "Sin fecha" }] }).hechos[0]?.cuando).toBeNull();
    expect(sintesisSchema.parse({ ...base, hechos: [{ cuando: null, que: "Sin fecha" }] }).hechos[0]?.cuando).toBeNull();
  });

  it("rechaza una síntesis sin situación", () => {
    expect(sintesisSchema.safeParse({ ...base, situacion: "" }).success).toBe(false);
  });
});
