import { isValidationError } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";

import { registrarCasoTool } from "./registrar-caso-tool.js";

describe("registrar-caso", () => {
  it("id estable (contrato con el BFF)", () => {
    expect(registrarCasoTool.id).toBe("registrar-caso");
  });

  it("acepta captura incremental (solo hechos, sin contacto)", async () => {
    const { execute } = registrarCasoTool;
    if (!execute) throw new Error("execute is not defined");

    const result = await execute(
      { hechos: "Trabajó 3 años en una panadería; telegrama de despido el 15/07." },
      {} as never,
    );
    if (!result || isValidationError(result)) throw new Error("execute devolvió un resultado inesperado");

    expect(result.status).toBe("ok");
  });

  it("rechaza un registro vacío", () => {
    const { inputSchema } = registrarCasoTool;
    if (!inputSchema) throw new Error("inputSchema is not defined");

    const parsed = inputSchema["~standard"].validate({});
    if (parsed instanceof Promise) throw new Error("la validación no debería ser asíncrona");

    expect(parsed.issues).toBeTruthy();
  });

  it("rechaza un registro con valores explícitamente undefined", () => {
    const { inputSchema } = registrarCasoTool;
    if (!inputSchema) throw new Error("inputSchema is not defined");

    const parsed = inputSchema["~standard"].validate({ hechos: undefined });
    if (parsed instanceof Promise) throw new Error("la validación no debería ser asíncrona");

    expect(parsed.issues).toBeTruthy();
  });
});
