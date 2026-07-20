import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("../prisma", () => ({ prisma: db }));

import { crearSesionRevision, getSesionRevision, listarSesionesRevision } from "./sesiones";

describe("sesiones de revisión", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crearSesionRevision genera sessionId propio y marca esRevision", async () => {
    db.conversation.create.mockResolvedValue({ id: "c1", threadId: "chat-x" });
    const result = await crearSesionRevision({ titulo: "Despido con licencia", creadaPor: "Dra. García" });
    expect(result).toEqual({ id: "c1", threadId: "chat-x" });
    const data = db.conversation.create.mock.calls[0][0].data;
    expect(data.esRevision).toBe(true);
    expect(data.creadaPor).toBe("Dra. García");
    expect(data.threadId).toBe(`chat-${data.sessionId}`);
  });

  it("listarSesionesRevision resume conteos de notas por estado", async () => {
    db.conversation.findMany.mockResolvedValue([
      {
        id: "c1", titulo: "t", creadaPor: "Dra. García", updatedAt: new Date("2026-07-20T10:00:00Z"),
        notas: [{ estado: "ABIERTA" }, { estado: "ABIERTA" }, { estado: "RESPONDIDA" }, { estado: "RESUELTA" }],
      },
    ]);
    const [sesion] = await listarSesionesRevision();
    expect(sesion.notasAbiertas).toBe(2);
    expect(sesion.notasRespondidas).toBe(1);
    expect(db.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { esRevision: true } }),
    );
  });

  it("getSesionRevision filtra por esRevision (una conversación real da null)", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    expect(await getSesionRevision("c-real")).toBeNull();
    expect(db.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-real", esRevision: true } }),
    );
  });
});
