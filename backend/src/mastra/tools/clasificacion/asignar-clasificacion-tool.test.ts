import { describe, expect, it } from "vitest";

import { asignarClasificacionTool } from "./asignar-clasificacion-tool.js";

describe("asignar-clasificacion", () => {
  it("id estable (contrato con el BFF)", () => {
    expect(asignarClasificacionTool.id).toBe("asignar-clasificacion");
  });

  it("acepta una asignación fast-path completa", async () => {
    const result = await asignarClasificacionTool.execute(
      {
        categoria: "laboral",
        subcategoria: "despido",
        confianza: "alta",
        casoSensible: false,
        brief: "Despedido ayer sin pago de liquidación, 3 años de antigüedad.",
      },
      {} as never,
    );
    expect(result.status).toBe("ok");
  });

  it("rechaza una categoría deshabilitada por schema", () => {
    const parsed = asignarClasificacionTool.inputSchema.safeParse({
      categoria: "familia",
      confianza: "alta",
      casoSensible: false,
      brief: "x",
    });
    expect(parsed.success).toBe(false);
  });
});
