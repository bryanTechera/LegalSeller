import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  notaRevision: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  respuestaNota: { create: vi.fn() },
  conversation: { findFirst: vi.fn() },
}));
vi.mock("../prisma", () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) },
}));

import { crearNota, resolverNota, responderNota } from "./notas";

describe("crearNota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nota de experto nace ABIERTA", async () => {
    tx.conversation.findFirst.mockResolvedValue({ id: "c1" });
    tx.notaRevision.create.mockResolvedValue({ id: "n1" });
    await crearNota({ conversationId: "c1", origen: "EXPERTO", autor: "Dra. García", texto: "Inventó el plazo", messageId: "m2", citaTexto: "tenés 30 días" });
    expect(tx.notaRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "ABIERTA", autor: "Dra. García", messageId: "m2" }) }),
    );
  });

  it("nota del equipo dev nace RESPONDIDA (pendiente del experto)", async () => {
    tx.conversation.findFirst.mockResolvedValue({ id: "c1" });
    tx.notaRevision.create.mockResolvedValue({ id: "n2" });
    await crearNota({ conversationId: "c1", origen: "DEV", autor: "equipo-dev", texto: "¿Podés aclarar el escenario?" });
    expect(tx.notaRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "RESPONDIDA" }) }),
    );
  });

  it("rechaza una conversación que no es sesión de revisión", async () => {
    tx.conversation.findFirst.mockResolvedValue(null);
    const result = await crearNota({ conversationId: "c-real", origen: "DEV", autor: "equipo-dev", texto: "x" });
    expect(result).toBeNull();
    expect(tx.notaRevision.create).not.toHaveBeenCalled();
  });
});

describe("responderNota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("respuesta DEV sobre ABIERTA → crea respuesta y pasa a RESPONDIDA", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "ABIERTA" });
    const result = await responderNota({ notaId: "n1", origen: "DEV", autor: "equipo-dev", texto: "Corregido, probá de nuevo" });
    expect(result.ok).toBe(true);
    expect(tx.respuestaNota.create).toHaveBeenCalled();
    expect(tx.notaRevision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1", estado: "ABIERTA" }, data: { estado: "RESPONDIDA" } }),
    );
  });

  it("respuesta EXPERTO sobre RESPONDIDA → vuelve a ABIERTA", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "RESPONDIDA" });
    const result = await responderNota({ notaId: "n1", origen: "EXPERTO", autor: "Dra. García", texto: "Sigue mal" });
    expect(result.ok).toBe(true);
    expect(tx.notaRevision.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1", estado: "RESPONDIDA" }, data: { estado: "ABIERTA" } }),
    );
  });

  it("respuesta del mismo lado no cambia el estado", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "ABIERTA" });
    const result = await responderNota({ notaId: "n1", origen: "EXPERTO", autor: "Dra. García", texto: "Agrego contexto" });
    expect(result.ok).toBe(true);
    expect(tx.respuestaNota.create).toHaveBeenCalled();
    expect(tx.notaRevision.updateMany).not.toHaveBeenCalled();
  });

  it("nota RESUELTA o inexistente → rechaza sin escribir", async () => {
    tx.notaRevision.findUnique.mockResolvedValueOnce({ id: "n1", estado: "RESUELTA" }).mockResolvedValueOnce(null);
    expect((await responderNota({ notaId: "n1", origen: "DEV", autor: "equipo-dev", texto: "x" })).ok).toBe(false);
    expect((await responderNota({ notaId: "nope", origen: "DEV", autor: "equipo-dev", texto: "x" })).ok).toBe(false);
    expect(tx.respuestaNota.create).not.toHaveBeenCalled();
  });
});

describe("resolverNota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca RESUELTA una nota existente", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "ABIERTA" });
    expect((await resolverNota("n1")).ok).toBe(true);
    expect(tx.notaRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" }, data: { estado: "RESUELTA" } }),
    );
  });

  it("nota inexistente → ok false", async () => {
    tx.notaRevision.findUnique.mockResolvedValue(null);
    expect((await resolverNota("nope")).ok).toBe(false);
  });
});
