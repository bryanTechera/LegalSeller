import { describe, expect, it } from "vitest";

import { crearSkillTools } from "./index.js";

interface ToolConEjecucion {
  id: string;
  description: string;
  execute: (ctx: unknown) => Promise<{ status: "ok"; contenido: string }>;
}

function esToolConEjecucion(value: unknown): value is ToolConEjecucion {
  return typeof value === "object" && value !== null && "execute" in value;
}

describe("crearSkillTools", () => {
  it("laboral recibe guia-proceso-derivacion y la tool devuelve el contenido", async () => {
    const tools = crearSkillTools("laboral", null);
    const tool = tools["guia-proceso-derivacion"];
    expect(tool).toBeDefined();
    if (!esToolConEjecucion(tool)) throw new Error("la tool no expone execute");
    const result = await tool.execute({ context: {} });
    expect(result.status).toBe("ok");
    expect(result.contenido).toContain("<proceso_derivacion>");
    expect(result.contenido).toContain("abogado");
  });

  it("recepcion no recibe tool skills (spec §4.6)", () => {
    expect(Object.keys(crearSkillTools("recepcion", null))).toEqual([]);
  });
});
