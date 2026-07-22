import { describe, expect, it } from "vitest";

import { escenarioSchema } from "./schema";

const valido = {
  titulo: "Divorcio con hijos",
  persona: "Mariana, 38, dos hijos.",
  turnos: ["me quiero divorciar"],
};

describe("escenarioSchema", () => {
  it("acepta un escenario mínimo válido", () => {
    expect(escenarioSchema.parse(valido)).toMatchObject({ titulo: "Divorcio con hijos" });
  });

  it("rechaza escenario sin persona", () => {
    expect(escenarioSchema.safeParse({ ...valido, persona: undefined }).success).toBe(false);
  });

  it("rechaza guion vacío", () => {
    expect(escenarioSchema.safeParse({ ...valido, turnos: [] }).success).toBe(false);
  });

  it("rechaza clasificacion esperada con categoria vacía", () => {
    const conExpectativas = { ...valido, expectativas: { clasificacion: { categoria: "" } } };
    expect(escenarioSchema.safeParse(conExpectativas).success).toBe(false);
  });
});
