import { beforeEach, describe, expect, it, vi } from "vitest";

const generateEmbedding = vi.fn();
const query = vi.fn();
const release = vi.fn();
const connect = vi.fn();

vi.mock("../../config/embedding.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../config/embedding.js")>();
  return { ...real, generateEmbedding };
});

vi.mock("../../config/storage.js", () => ({
  getPool: () => ({ connect, query }),
}));

const { registerDocument } = await import("./index.js");

const VECTOR = Array.from({ length: 3072 }, () => 0.1);

beforeEach(() => {
  // clearAllMocks NO vacía la cola de mockResolvedValueOnce pendiente entre tests.
  vi.resetAllMocks();
  connect.mockResolvedValue({ query, release });
  query.mockResolvedValue({ rows: [] });
  generateEmbedding.mockResolvedValue(VECTOR);
});

describe("registerDocument", () => {
  it("escribe chunks y huellas dentro de una transacción", async () => {
    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("ok");
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.at(-1)).toBe("COMMIT");
    expect(sqls.some((s) => s.includes('DELETE FROM "DocumentChunk"'))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE "Document"'))).toBe(true);
  });

  it("si un embedding falla, no abre transacción y el documento queda intacto", async () => {
    generateEmbedding.mockRejectedValue(new Error("429 rate limit"));

    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("error");
    expect(query).not.toHaveBeenCalled();
  });

  it("rechaza un embedding con dimensión inesperada sin escribir nada", async () => {
    generateEmbedding.mockResolvedValue([0.1, 0.2]);

    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("error");
    expect(query).not.toHaveBeenCalled();
  });

  it("si falla una escritura, hace ROLLBACK", async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO "DocumentChunk"')) throw new Error("deadlock");
      return Promise.resolve({ rows: [] });
    });

    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("error");
    expect(query.mock.calls.map((c) => String(c[0]))).toContain("ROLLBACK");
    expect(release).toHaveBeenCalled();
  });

  it("si el ROLLBACK también falla, propaga el error original de la escritura, no el del rollback", async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO "DocumentChunk"')) throw new Error("deadlock");
      if (sql === "ROLLBACK") throw new Error("connection terminated");
      return Promise.resolve({ rows: [] });
    });

    const result = await registerDocument({
      documentId: "doc-1",
      text: "# T\n\nTexto del documento legal.",
      contentHash: "a".repeat(64),
      pipelineVersion: "modelo|NINGUNO|2000:200",
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("deadlock");
    expect(release).toHaveBeenCalled();
  });
});
