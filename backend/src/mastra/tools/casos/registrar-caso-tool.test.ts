import { describe, expect, it } from "vitest";

import { registrarCasoTool } from "./registrar-caso-tool.js";

describe("registrar-caso", () => {
  it("id estable (contrato con el BFF)", () => {
    expect(registrarCasoTool.id).toBe("registrar-caso");
  });

  it("acepta captura incremental (solo hechos, sin contacto)", async () => {
    const result = await registrarCasoTool.execute(
      { hechos: "Trabajó 3 años en una panadería; telegrama de despido el 15/07." },
      {} as never,
    );
    expect(result.status).toBe("ok");
  });

  it("rechaza un registro vacío", () => {
    expect(registrarCasoTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza un registro con valores explícitamente undefined", () => {
    expect(registrarCasoTool.inputSchema.safeParse({ hechos: undefined }).success).toBe(false);
  });
});
