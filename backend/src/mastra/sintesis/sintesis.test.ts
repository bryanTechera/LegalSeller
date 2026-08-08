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

  // El residual medido del prompt "3": sobre una fecha real que la persona sí
  // dio ("15 de julio"), el modelo le agregaba el año por su cuenta. El par
  // contrastivo es lo que cerró el caso análogo de "todavía", así que este
  // constraint también lleva el suyo.
  it("trae un par contrastivo propio sobre completar el año", () => {
    expect(PROMPT_SINTESIS).toMatch(/sin agregarle el año si no lo nombró/);
    expect(PROMPT_SINTESIS).toContain(`"cuando": "15 de julio de 2026"`);
    expect(PROMPT_SINTESIS).toContain(`"cuando": "15 de julio"`);
  });

  // La regla de `cuando` era una sola oración de ~90 palabras con cinco
  // restricciones adentro, y la prohibición del año quedaba enterrada al medio.
  // Una restricción por línea es la forma en que el resto del proyecto escribe
  // reglas de prompt.
  it("declara las restricciones de `cuando` una por línea", () => {
    const lineasDeCuando = PROMPT_SINTESIS.split("\n").filter((linea) => linea.includes("cuando"));
    expect(lineasDeCuando.length).toBeGreaterThanOrEqual(4);
  });

  // Esta regla y el anclaje de `formatearMaterial` son un par: sacarla hizo
  // volver el año inventado en 2 de 6 corridas contra un caso real.
  it("explica que las fechas entre corchetes son del mensaje, no del hecho", () => {
    expect(PROMPT_SINTESIS).toMatch(/entre corchetes/);
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

  // Sin esto el modelo no tiene de dónde sacar una fecha, y la regla del
  // prompt sobre "las fechas entre corchetes" habla de algo que no está: al
  // sacar el par (anclaje + regla), 2 de 6 corridas volvieron a escribir "15
  // de julio de 2026" sobre una fecha que la persona dio sin año.
  it("ancla cada turno en su fecha y declara cuándo se abrió el caso", () => {
    const conFechas = materialSchema.parse({
      caso: {
        categoria: "laboral",
        subcategorias: ["despido"],
        estado: "CAPTADO",
        resumen: null,
        abiertoEn: "2026-08-08T13:00:00.000Z",
      },
      mensajes: [
        { rol: "user", texto: "Me echaron el 15 de julio", fecha: "2026-08-08T13:00:00.000Z" },
        { rol: "assistant", texto: "Contame más", fecha: "2026-08-08T13:01:00.000Z" },
      ],
    });

    const texto = formatearMaterial(conFechas);

    expect(texto).toContain("Caso abierto el: 2026-08-08");
    expect(texto).toContain("[2026-08-08] Consultante: Me echaron el 15 de julio");
    expect(texto).toContain("[2026-08-08] Asistente: Contame más");
  });

  // La fecha se muestra en la zona del consultante: un mensaje de la madrugada
  // UTC es del día anterior en Montevideo, y el legajo se lee acá.
  it("usa la zona de Montevideo, no UTC", () => {
    const madrugada = materialSchema.parse({
      caso: { categoria: "laboral", subcategorias: [], estado: "CAPTADO", resumen: null },
      mensajes: [{ rol: "user", texto: "Hola", fecha: "2026-08-08T01:30:00.000Z" }],
    });
    expect(formatearMaterial(madrugada)).toContain("[2026-08-07] Consultante: Hola");
  });

  // El anclaje es una ayuda, no un requisito: un transcript viejo sin fechas, o
  // una fecha que no parsea, tienen que producir material igual de válido.
  it("omite el anclaje cuando la fecha falta o no parsea, sin romper el turno", () => {
    const sinFechas = materialSchema.parse({
      caso: { categoria: "laboral", subcategorias: [], estado: "CAPTADO", resumen: null, abiertoEn: "no es fecha" },
      mensajes: [
        { rol: "user", texto: "Me echaron" },
        { rol: "assistant", texto: "Contame más", fecha: "tampoco" },
      ],
    });

    const texto = formatearMaterial(sinFechas);

    expect(texto).not.toContain("Caso abierto el:");
    expect(texto).not.toContain("Invalid Date");
    expect(texto).toContain("Consultante: Me echaron");
    expect(texto).toContain("Asistente: Contame más");
  });
});
