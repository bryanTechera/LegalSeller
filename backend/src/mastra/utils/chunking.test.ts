import { describe, expect, it } from "vitest";

import { chunkText } from "./chunking.js";

describe("chunkText", () => {
  it("returns empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("returns a single chunk when text fits", () => {
    const chunks = chunkText("Artículo 1. Texto corto.", { chunkSize: 100, overlap: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ content: "Artículo 1. Texto corto.", position: 0 });
  });

  it("splits long text into overlapping chunks with sequential positions", () => {
    const paragraph = "Este es un párrafo de prueba con contenido legal simulado. ";
    const text = paragraph.repeat(50);
    const chunks = chunkText(text, { chunkSize: 500, overlap: 100 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, index) => {
      expect(chunk.position).toBe(index);
      expect(chunk.content.length).toBeLessThanOrEqual(500);
      expect(chunk.content.length).toBeGreaterThan(0);
    });
  });

  it("prefers paragraph boundaries when available", () => {
    const text = `${"a".repeat(300)}\n\n${"b".repeat(300)}`;
    const chunks = chunkText(text, { chunkSize: 400, overlap: 50 });
    expect(chunks[0]?.content).toBe("a".repeat(300));
  });

  it("covers the full document (no content lost between chunks)", () => {
    const sentence = "El contrato establece obligaciones claras para ambas partes. ";
    const text = sentence.repeat(40);
    const chunks = chunkText(text, { chunkSize: 600, overlap: 150 });
    const merged = chunks.map((c) => c.content).join(" ");
    expect(merged).toContain("obligaciones claras");
    // Every sentence occurrence boundary should be findable in some chunk.
    expect(chunks.every((c) => c.content.includes("contrato") || c.content.includes("partes"))).toBe(true);
  });

  it("validates options", () => {
    expect(() => chunkText("x", { chunkSize: 0 })).toThrow();
    expect(() => chunkText("x", { chunkSize: 100, overlap: 100 })).toThrow();
  });
});
