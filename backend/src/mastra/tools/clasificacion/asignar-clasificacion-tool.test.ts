import { isValidationError } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";

import { asignarClasificacionTool } from "./asignar-clasificacion-tool.js";

describe("asignar-clasificacion", () => {
  it("id estable (contrato con el BFF)", () => {
    expect(asignarClasificacionTool.id).toBe("asignar-clasificacion");
  });

  it("acepta una asignación fast-path completa", async () => {
    const { execute } = asignarClasificacionTool;
    if (!execute) throw new Error("execute is not defined");

    const result = await execute(
      {
        categoria: "laboral",
        subcategoria: "despido",
        confianza: "alta",
        casoSensible: false,
        brief: "Despedido ayer sin pago de liquidación, 3 años de antigüedad.",
      },
      {} as never,
    );
    if (!result || isValidationError(result)) throw new Error("execute devolvió un resultado inesperado");

    expect(result.status).toBe("ok");
  });

  it("rechaza una categoría deshabilitada por schema", () => {
    const { inputSchema } = asignarClasificacionTool;
    if (!inputSchema) throw new Error("inputSchema is not defined");

    const parsed = inputSchema["~standard"].validate({
      categoria: "familia",
      confianza: "alta",
      casoSensible: false,
      brief: "x",
    });
    if (parsed instanceof Promise) throw new Error("la validación no debería ser asíncrona");

    expect(parsed.issues).toBeTruthy();
  });
});
