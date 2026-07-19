import { describe, expect, it } from "vitest";

import { buildDynamicInstructions, crearAgente } from "./crear-agente.js";

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
