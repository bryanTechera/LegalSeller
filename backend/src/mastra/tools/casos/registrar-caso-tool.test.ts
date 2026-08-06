import { isValidationError } from "@mastra/core/tools";
import { describe, expect, it } from "vitest";

import { categoriasHabilitadas, subcategoriasHabilitadas } from "../../dominios/registry.js";

import { crearRegistrarCasoTool, registrarCasoTool } from "./registrar-caso-tool.js";

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

describe("crearRegistrarCasoTool — acotado por categoría", () => {
  it("el inputSchema de laboral no acepta ninguna subcategoría de otra categoría (ni las de arrendamiento)", () => {
    const { inputSchema } = crearRegistrarCasoTool("laboral");
    if (!inputSchema) throw new Error("inputSchema is not defined");

    const idsDeOtrasCategorias = categoriasHabilitadas()
      .filter((c) => c.id !== "laboral")
      .flatMap((c) => subcategoriasHabilitadas(c.id).map((s) => s.id));

    // Sanity check: si esto no tiene ningún id, el resto del test queda vacío y no prueba nada.
    expect(idsDeOtrasCategorias.some((id) => id.startsWith("desalojo-ley-"))).toBe(true);

    for (const id of idsDeOtrasCategorias) {
      const parsed = inputSchema["~standard"].validate({ subcategorias: [id] });
      if (parsed instanceof Promise) throw new Error("la validación no debería ser asíncrona");
      expect(parsed.issues, `${id} no debería ser una subcategoría válida para laboral`).toBeTruthy();
    }

    const propia = inputSchema["~standard"].validate({ subcategorias: ["despido"] });
    if (propia instanceof Promise) throw new Error("la validación no debería ser asíncrona");
    expect(propia.issues).toBeFalsy();
  });
});
