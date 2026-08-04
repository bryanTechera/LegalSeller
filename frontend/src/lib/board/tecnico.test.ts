import { describe, expect, it } from "vitest";

import type { ItemTimeline } from "@/lib/revision/timeline";

import { resumirTecnico } from "./tecnico";

const timeline: ItemTimeline[] = [
  { tipo: "mensaje", id: "m1", rol: "user", texto: "hola", fecha: "2026-08-04T10:00:00.000Z" },
  { tipo: "turno-agente", spanId: "run1", agente: "recepcion", fecha: "2026-08-04T10:00:01.000Z" },
  { tipo: "turno-agente", spanId: "run2", agente: "laboral", fecha: "2026-08-04T10:00:02.000Z" },
  { tipo: "tool-call", spanId: "t1", tool: "buscar-documentos", agente: "laboral", input: null, output: null, error: null, fecha: "2026-08-04T10:00:03.000Z" },
  { tipo: "tool-call", spanId: "t2", tool: "registrar-caso", agente: "laboral", input: null, output: null, error: null, fecha: "2026-08-04T10:00:04.000Z" },
  { tipo: "tool-call", spanId: "t3", tool: "updateWorkingMemory", agente: "laboral", input: null, output: null, error: null, fecha: "2026-08-04T10:00:05.000Z" },
  { tipo: "generacion", spanId: "g1", modelo: "openai/gpt-5.6-luna", tokensEntrada: 1000, tokensSalida: 500, fecha: "2026-08-04T10:00:06.000Z" },
];

describe("resumirTecnico", () => {
  it("junta agentes, modelos y tokens sin repetir", () => {
    const resumen = resumirTecnico([...timeline, { tipo: "generacion", spanId: "g2", modelo: "openai/gpt-5.6-luna", tokensEntrada: 200, tokensSalida: 100, fecha: "2026-08-04T10:00:07.000Z" }]);
    expect(resumen.agentes).toEqual(["recepcion", "laboral"]);
    expect(resumen.modelos).toEqual(["openai/gpt-5.6-luna"]);
    expect(resumen.tokensEntrada).toBe(1200);
    expect(resumen.tokensSalida).toBe(600);
  });

  it("deja fuera buscar-documentos (tiene su propia solapa) y el ruido interno de Mastra", () => {
    expect(resumirTecnico(timeline).tools).toEqual([{ tool: "registrar-caso", agente: "laboral", conError: false }]);
  });

  it("estima el costo con la tabla del board", () => {
    // gpt-5.6-luna: 0.2 USD/M entrada, 1.2 USD/M salida.
    expect(resumirTecnico(timeline).costoUsd).toBeCloseTo(0.0008, 6);
  });

  it("un modelo sin precio deja el costo en null, no en cero", () => {
    // Reportar 0 para un modelo desconocido esconde justo el evento que interesa ver.
    const conDesconocido: ItemTimeline[] = [
      ...timeline,
      { tipo: "generacion", spanId: "g9", modelo: "modelo-nuevo-sin-precio", tokensEntrada: 10, tokensSalida: 10, fecha: "2026-08-04T10:00:08.000Z" },
    ];
    expect(resumirTecnico(conDesconocido).costoUsd).toBeNull();
  });

  it("una timeline sin spans devuelve un resumen vacío y costo cero", () => {
    const resumen = resumirTecnico([timeline[0]!]);
    expect(resumen).toMatchObject({ agentes: [], modelos: [], tokensEntrada: 0, tokensSalida: 0, tools: [], costoUsd: 0 });
  });
});
