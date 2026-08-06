import { describe, expect, it } from "vitest";

import type { AgentId } from "../../../../models/index.js";

import { confidencialidadSistemaRule } from "./confidencialidad-sistema.js";

const AGENTES: AgentId[] = [
  "recepcion",
  "laboral",
  "familia",
  "transito",
  "arrendamiento-desalojo",
  "relaciones-consumo",
];

describe("confidencialidadSistemaRule", () => {
  it("activa para los 6 agentes con el tag canónico", () => {
    for (const agentId of AGENTES) {
      const contenido = confidencialidadSistemaRule(null, agentId);
      expect(contenido, agentId).not.toBeNull();
      expect(contenido, agentId).toContain("<confidencialidad>");
    }
  });

  it("no nombra el modelo, la versión ni el proveedor — nombrar el secreto dentro del prompt que lo protege es contraproducente", () => {
    const contenido = confidencialidadSistemaRule(null, "laboral") ?? "";
    for (const prohibido of ["OpenAI", "Gemini", "gpt-", "Mastra", "pgvector", "RAG"]) {
      expect(contenido, prohibido).not.toContain(prohibido);
    }
  });

  it("declara qué SÍ se responde, para no romper el funnel", () => {
    const contenido = confidencialidadSistemaRule(null, "laboral") ?? "";
    expect(contenido).toContain("inteligencia artificial");
    expect(contenido).toContain("contacto");
  });

  it("usa la forma tuteante del subjuntivo negativo, no la voseante", () => {
    // Ojo: un regex genérico tipo /no\s+\w+és\b/ da falso positivo sobre "no
    // podés", que es indicativo voseante y SÍ corresponde. Se listan las formas
    // concretas en riesgo.
    const contenido = confidencialidadSistemaRule(null, "laboral") ?? "";
    for (const voseante of ["expliqués", "describás", "enumerés", "pongás", "confirmés", "traduzcás", "deletreés"]) {
      expect(contenido, voseante).not.toContain(voseante);
    }
  });
});
