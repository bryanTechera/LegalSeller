import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  caso: { create: vi.fn(), upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  casoEvento: { create: vi.fn(), count: vi.fn() },
}));
vi.mock("./prisma", () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) },
}));

import { asignarClasificacion, corregirClasificacion } from "./clasificacion";

describe("asignarClasificacion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("first-write-wins: no pisa una categoría ya asignada", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral" });
    const result = await asignarClasificacion({ sessionId: "s1", categoria: "familia" });
    expect(result).toEqual({ categoria: "laboral", aplicada: false });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("asigna, crea el caso y registra el evento CLASIFICACION", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.upsert.mockResolvedValue({ id: "k1" });
    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "laboral",
      subcategoria: "despido",
      brief: "despido sin liquidación",
    });
    expect(result.aplicada).toBe(true);
    expect(tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", categoria: null },
        data: expect.objectContaining({ categoria: "laboral" }),
      }),
    );
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CLASIFICACION" }) }),
    );
  });

  it("escape fuera de cobertura: no asigna categoría de ruteo, marca el caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.upsert.mockResolvedValue({ id: "k1" });
    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });
    expect(result).toEqual({ categoria: null, aplicada: false });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.caso.upsert).toHaveBeenCalled(); // demand signal recorded
  });
});

describe("corregirClasificacion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aplica una sola corrección por conversación", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", caso: { id: "k1" } });
    tx.casoEvento.count.mockResolvedValue(1); // already corrected once
    const result = await corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "x" });
    expect(result.aplicada).toBe(false);
  });
});
