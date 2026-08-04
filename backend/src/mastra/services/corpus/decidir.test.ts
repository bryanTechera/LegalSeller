import { describe, expect, it } from "vitest";

import { decidirAccion } from "./decidir.js";

const VERSION = "gemini-embedding-001|NINGUNO|2000:200";
const HASH = "a".repeat(64);

describe("decidirAccion", () => {
  it("documento nuevo (sin fila en la base): reingestar", () => {
    expect(decidirAccion(null, HASH, VERSION)).toBe("reingestar");
  });

  it("misma huella de archivo y de pipeline: saltar", () => {
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: VERSION }, HASH, VERSION)).toBe("saltar");
  });

  it("cambió el archivo: reingestar", () => {
    expect(decidirAccion({ contentHash: "b".repeat(64), pipelineVersion: VERSION }, HASH, VERSION)).toBe("reingestar");
  });

  it("cambió el taskType con el mismo archivo: reembeber desde los chunks guardados", () => {
    const vieja = "gemini-embedding-001|NINGUNO|2000:200";
    const nueva = "gemini-embedding-001|RETRIEVAL_DOCUMENT|2000:200";
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: vieja }, HASH, nueva)).toBe("reembeber");
  });

  it("cambió el chunkeo: reingestar, porque los chunks guardados tienen los límites viejos", () => {
    const vieja = "gemini-embedding-001|NINGUNO|2000:200";
    const nueva = "gemini-embedding-001|NINGUNO|1200:150";
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: vieja }, HASH, nueva)).toBe("reingestar");
  });

  it("fila legada sin huellas (ambas NULL): reingestar", () => {
    // Estado de las 155 filas antes del --backfill de la Tarea 7.
    expect(decidirAccion({ contentHash: null, pipelineVersion: null }, HASH, VERSION)).toBe("reingestar");
  });

  it("huella de pipeline con forma inesperada: reingestar (no se arriesga un reembeber inválido)", () => {
    expect(decidirAccion({ contentHash: HASH, pipelineVersion: "basura" }, HASH, VERSION)).toBe("reingestar");
  });
});
