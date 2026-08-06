import { describe, expect, it } from "vitest";

import { buildDynamicInstructions, crearAgente, opcionesDeModelo, opcionesDeProcessors } from "./crear-agente.js";

const params = {
  id: "prueba",
  name: "pruebaAgent",
  description: "Agente de prueba",
  buildInstructions: (readOnly: { userId: string } | null) =>
    readOnly ? `<rol>hola ${readOnly.userId}</rol>` : "<rol>hola</rol>",
  buildTools: () => ({}),
};

describe("crearAgente", () => {
  it("crea un Agent con el id dado", () => {
    const agent = crearAgente(params);
    expect(agent.id).toBe("prueba");
  });

  it("null-guard asimétrico: sin requestContext devuelve instrucciones vacías en vez de tirar", () => {
    // Contingency (brief nota): el `Agent.getInstructions()` público de la
    // versión instalada de @mastra/core valida el resultado y tira
    // MastraError si es falsy, así que nunca deja observar el "" del
    // null-guard. Se testea el builder puro exportado en su lugar; el
    // contrato de crearAgente no cambia.
    const dynamicInstructions = buildDynamicInstructions(() => {
      throw new Error("boom");
    });
    // Startup/listing path: no request context — must not throw.
    const instructions = dynamicInstructions({ requestContext: undefined });
    expect(instructions).toBe("");
  });
});

describe("opcionesDeModelo", () => {
  it("Gemini: temperature explícita y provider order de Google", () => {
    expect(opcionesDeModelo("google/gemini-3.5-flash-lite")).toEqual({
      modelSettings: { temperature: 1 },
      providerOptions: { gateway: { order: ["google", "vertex"] } },
    });
  });

  it("OpenAI: effort de razonamiento, sin temperature ni proveedores de Google", () => {
    // `temperature` es el knob de Gemini; en un modelo de razonamiento de
    // OpenAI el equivalente es el effort. Y pinear ["google","vertex"] sobre
    // un modelo `openai/` nombra proveedores que no lo sirven.
    expect(opcionesDeModelo("openai/gpt-5.6-luna")).toEqual({
      providerOptions: {
        openai: { reasoningEffort: "low" },
        gateway: { only: ["openai"] },
      },
    });
  });

  it("mantiene el effort en `low`: arriba de ahí el TTFT rompe el chat", () => {
    const opciones = opcionesDeModelo("openai/gpt-5.6-luna");
    const providerOptions = opciones.providerOptions as { openai: { reasoningEffort: string } };
    expect(["none", "low"]).toContain(providerOptions.openai.reasoningEffort);
  });

  it("todo agente sale con el filtro de confidencialidad cableado", () => {
    const { outputProcessors } = opcionesDeProcessors();
    expect(outputProcessors().map((p) => p.id)).toContain("filtro-confidencialidad");
  });

  it("los processors se resuelven como función, para que el body del request no pueda pisarlos", () => {
    // El bodySchema de /api/agents/:id/stream no se valida en runtime y el
    // adapter spreadea el JSON crudo en los params: un {"outputProcessors": []}
    // en el body ganaría sobre un array literal del AgentConfig.
    const { inputProcessors, outputProcessors } = opcionesDeProcessors();
    expect(typeof inputProcessors).toBe("function");
    expect(typeof outputProcessors).toBe("function");
  });

  it("EVALS_SIN_PROCESSORS los desactiva — los evals de prompt tienen que medir la rule, no el filtro", () => {
    const previo = process.env.EVALS_SIN_PROCESSORS;
    process.env.EVALS_SIN_PROCESSORS = "1";
    try {
      expect(opcionesDeProcessors().outputProcessors()).toHaveLength(0);
      expect(opcionesDeProcessors().inputProcessors()).toHaveLength(0);
    } finally {
      if (previo === undefined) process.env.EVALS_SIN_PROCESSORS = undefined;
      else process.env.EVALS_SIN_PROCESSORS = previo;
    }
  });

  it("el agente se construye con los processors cableados", () => {
    expect(() => crearAgente(params)).not.toThrow();
  });
});
