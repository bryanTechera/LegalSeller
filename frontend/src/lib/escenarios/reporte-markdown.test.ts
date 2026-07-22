import { describe, expect, it } from "vitest";

import { renderCorridaMarkdown } from "./reporte-markdown";
import type { Corrida } from "./schema";

const corrida: Corrida = {
  escenario: "divorcio-con-hijos-visitas",
  titulo: "Divorcio con hijos",
  url: "http://localhost:3000",
  sesionId: "s1",
  inicio: "2026-07-22T19:00:00.000Z",
  turnos: [
    {
      n: 1,
      origen: "guion",
      usuario: "me quiero divorciar",
      respuesta: "Entiendo tu situación…",
      toolCalls: [{ toolName: "asignar-clasificacion", args: { categoria: "familia" } }],
      latenciaPrimerByteMs: 800,
      latenciaTotalMs: 9000,
    },
    {
      n: 2,
      origen: "improvisado",
      usuario: "nos casamos en 2015",
      respuesta: "Gracias…",
      toolCalls: [],
      latenciaPrimerByteMs: 700,
      latenciaTotalMs: 4000,
    },
  ],
  expectativas: [{ clave: "casoCaptado", esperado: true, obtenido: false, cumplida: false }],
  caso: null,
};

describe("renderCorridaMarkdown", () => {
  it("incluye transcript, tool-calls, origen del turno y expectativas", () => {
    const markdown = renderCorridaMarkdown(corrida);
    expect(markdown).toContain("me quiero divorciar");
    expect(markdown).toContain("asignar-clasificacion");
    expect(markdown).toContain("Turno 2 (improvisado)");
    expect(markdown).toContain("| casoCaptado | true | false | INCUMPLIDA |");
    expect(markdown).toContain("(sin caso registrado)");
  });
});
