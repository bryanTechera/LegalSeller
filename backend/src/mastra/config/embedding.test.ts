import { describe, expect, it } from "vitest";

import { CHUNK_OVERLAP, CHUNK_SIZE } from "../utils/chunking.js";

import { CHUNK_FINGERPRINT, EMBED_FINGERPRINT, PIPELINE_VERSION } from "./embedding.js";

describe("huellas del pipeline", () => {
  it("PIPELINE_VERSION combina la huella de embedding y la de chunkeo", () => {
    expect(PIPELINE_VERSION).toBe(`${EMBED_FINGERPRINT}|${CHUNK_FINGERPRINT}`);
  });

  it("la huella de chunkeo refleja los parámetros reales de chunkText", () => {
    expect(CHUNK_FINGERPRINT).toBe(`${String(CHUNK_SIZE)}:${String(CHUNK_OVERLAP)}`);
  });

  it("la huella de embedding nombra el modelo y el taskType", () => {
    expect(EMBED_FINGERPRINT).toContain("gemini-embedding-001");
    expect(EMBED_FINGERPRINT.split("|")).toHaveLength(2);
  });

  it("PIPELINE_VERSION tiene exactamente tres segmentos separados por |", () => {
    // La Tarea 4 parsea esta forma para distinguir un cambio de chunkeo
    // (requiere el archivo) de uno de embedding (se resuelve desde la base).
    expect(PIPELINE_VERSION.split("|")).toHaveLength(3);
  });
});
