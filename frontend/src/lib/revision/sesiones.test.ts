import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  caso: { findUnique: vi.fn() },
}));
vi.mock("../prisma", () => ({ prisma: db }));

import {
  crearSesionRevision,
  getCasoDeSesion,
  getSesionRevision,
  listarSesionesRevision,
  publicarSesionRevision,
} from "./sesiones";

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
    expect(data.origenRevision).toBe("EXPERTO");
    expect(data.borrador).toBe(false);
  });

  it("crearSesionRevision con origen autonoma nace como borrador", async () => {
    db.conversation.create.mockResolvedValue({ id: "c2", threadId: "chat-y" });
    await crearSesionRevision({ titulo: "[escenario] divorcio", creadaPor: "Asistente técnico", origen: "autonoma" });
    const data = db.conversation.create.mock.calls[0][0].data;
    expect(data.origenRevision).toBe("AUTONOMA");
    expect(data.borrador).toBe(true);
  });

  it("listarSesionesRevision resume conteos de notas y excluye borradores por default", async () => {
    db.conversation.findMany.mockResolvedValue([
      {
        id: "c1", titulo: "t", creadaPor: "Dra. García", origenRevision: "EXPERTO", borrador: false,
        updatedAt: new Date("2026-07-20T10:00:00Z"),
        notas: [{ estado: "ABIERTA" }, { estado: "ABIERTA" }, { estado: "RESPONDIDA" }, { estado: "RESUELTA" }],
      },
    ]);
    const [sesion] = await listarSesionesRevision();
    expect(sesion.notasAbiertas).toBe(2);
    expect(sesion.notasRespondidas).toBe(1);
    expect(db.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { esRevision: true, borrador: false } }),
    );
  });

  it("listarSesionesRevision con incluirBorradores no filtra por borrador", async () => {
    db.conversation.findMany.mockResolvedValue([]);
    await listarSesionesRevision({ incluirBorradores: true });
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

  it("publicarSesionRevision solo publica borradores de revisión", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 1 });
    expect(await publicarSesionRevision("c1")).toBe(true);
    expect(db.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", esRevision: true, borrador: true },
      data: { borrador: false },
    });
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    expect(await publicarSesionRevision("c1")).toBe(false);
  });

  it("getCasoDeSesion serializa el snapshot con sus eventos", async () => {
    db.caso.findUnique.mockResolvedValue({
      estado: "CAPTADO",
      categoria: "familia",
      subcategorias: ["divorcio-sociedad-conyugal"],
      resumen: { hechos: "x" },
      contactoNombre: "Mariana Techera",
      contactoTelefono: "099 000 001",
      contactoEmail: null,
      eventos: [{ tipo: "CLASIFICACION", payload: {}, createdAt: new Date("2026-07-22T12:00:00Z") }],
    });
    const caso = await getCasoDeSesion("c1");
    expect(caso?.estado).toBe("CAPTADO");
    expect(caso?.eventos[0]).toEqual({ tipo: "CLASIFICACION", payload: {}, createdAt: "2026-07-22T12:00:00.000Z" });
    db.caso.findUnique.mockResolvedValue(null);
    expect(await getCasoDeSesion("c-sin-caso")).toBeNull();
  });
});
