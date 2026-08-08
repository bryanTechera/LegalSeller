import { describe, expect, it } from "vitest";

import { PROMPT_SINTESIS, formatearMaterial } from "./prompt.js";
import { materialSchema, sintesisSchema } from "./schema.js";

describe("sintesisSchema", () => {
  const base = {
    situacion: "Lo despidieron sin causa tras seis años.",
    hechos: [{ cuando: "2026-07-15", que: "Le comunicaron la desvinculación por teléfono." }],
    datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
    pedido: "Quiere saber qué le corresponde cobrar.",
    faltantes: ["Último salario nominal"],
  };

  it("acepta la forma completa", () => {
    expect(sintesisSchema.parse(base).hechos[0]?.cuando).toBe("2026-07-15");
  });

  // Las dos familias del stack dicen "no tengo este dato" distinto: GPT manda
  // null explícito, Gemini omite la clave. Las dos tienen que entrar, o un
  // hecho sin fecha invalida la síntesis entera.
  it("acepta `cuando` en null y `cuando` ausente, y normaliza los dos a null", () => {
    const conNull = sintesisSchema.parse({ ...base, hechos: [{ cuando: null, que: "No recuerda la fecha." }] });
    const sinClave = sintesisSchema.parse({ ...base, hechos: [{ que: "No recuerda la fecha." }] });
    expect(conNull.hechos[0]?.cuando).toBeNull();
    expect(sinClave.hechos[0]?.cuando).toBeNull();
  });

  it("tolera que falten las listas, no que falte la situación", () => {
    expect(sintesisSchema.parse({ situacion: "Algo", pedido: "Algo" }).hechos).toEqual([]);
    expect(sintesisSchema.safeParse({ pedido: "Algo" }).success).toBe(false);
  });
});

describe("PROMPT_SINTESIS", () => {
  // Mismos chequeos que corren sobre rules y skills: la palabra "skill" hace
  // que el modelo intente invocar una herramienta inexistente, y los emojis
  // gastan tokens sin aportar semántica.
  it("no usa la palabra skill ni emojis", () => {
    expect(PROMPT_SINTESIS.toLowerCase()).not.toContain("skill");
    expect(PROMPT_SINTESIS).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("ordena ceñirse al caso y no inventar", () => {
    expect(PROMPT_SINTESIS).toContain("faltantes");
    expect(PROMPT_SINTESIS).toMatch(/solo lo que/i);
  });
});

describe("formatearMaterial", () => {
  const material = materialSchema.parse({
    caso: { categoria: "laboral", subcategorias: ["despido"], estado: "CAPTADO", resumen: "Despido sin causa." },
    mensajes: [
      { rol: "user", texto: "Me echaron ayer" },
      { rol: "assistant", texto: "Lamento escuchar eso" },
    ],
  });

  it("marca quién habla en cada turno y trae los datos del caso", () => {
    const texto = formatearMaterial(material);
    expect(texto).toContain("laboral");
    expect(texto).toContain("despido");
    expect(texto).toContain("Consultante: Me echaron ayer");
    expect(texto).toContain("Asistente: Lamento escuchar eso");
  });

  it("acepta un caso sin categoría (pedido fuera de cobertura)", () => {
    const sinCategoria = materialSchema.parse({
      caso: { categoria: null, subcategorias: [], estado: "FUERA_DE_COBERTURA", resumen: null },
      mensajes: [{ rol: "user", texto: "Tengo un problema de propiedad horizontal" }],
    });
    expect(formatearMaterial(sinCategoria)).toContain("sin categoría asignada");
  });
});
