import { isValidationError } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";

import { derivarTemaTool } from "./derivar-tema-tool.js";

describe("derivarTemaTool", () => {
  it("se publica con el id que observa el BFF", () => {
    expect(derivarTemaTool.id).toBe("derivar-tema");
  });

  it("exige el tema en las palabras del usuario", () => {
    expect(derivarTemaTool.inputSchema.safeParse({ tema: "" }).success).toBe(false);
    expect(derivarTemaTool.inputSchema.safeParse({}).success).toBe(false);
    expect(derivarTemaTool.inputSchema.safeParse({ tema: "me chocaron el auto" }).success).toBe(true);
  });

  it("nunca tira: devuelve el contrato de status", async () => {
    const { execute } = derivarTemaTool;
    if (!execute) throw new Error("execute is not defined");

    const resultado = await execute({ tema: "me chocaron" }, {} as never);
    if (!resultado || isValidationError(resultado)) throw new Error("execute devolvió un resultado inesperado");

    expect(resultado.status).toBe("ok");
    expect(typeof resultado.mensaje).toBe("string");
  });
});
