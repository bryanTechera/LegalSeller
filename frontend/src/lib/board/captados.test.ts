import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: { caso: { findMany: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { listarCaptados } from "./captados";

const DESDE = new Date("2026-07-25T00:00:00.000Z");

function filaCaso(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: "c1",
    contactoNombre: "Ana Pérez",
    contactoTelefono: "099123456",
    contactoEmail: "ana@ejemplo.com",
    conversation: { threadId: "chat-c1" },
    ...overrides,
  };
}

describe("listarCaptados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.caso.findMany.mockResolvedValue([filaCaso()]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-c1", ultimoMensaje: new Date("2026-07-30T14:00:00.000Z") },
    ]);
  });

  it("arma la fila con el contacto y la fecha del último mensaje", async () => {
    expect(await listarCaptados(DESDE)).toEqual([
      {
        conversationId: "c1",
        ultimoMensaje: "2026-07-30T14:00:00.000Z",
        contactoNombre: "Ana Pérez",
        contactoTelefono: "099123456",
        contactoEmail: "ana@ejemplo.com",
      },
    ]);
  });

  it("solo trae casos en estado CAPTADO", async () => {
    await listarCaptados(DESDE);
    const where = prismaMock.prisma.caso.findMany.mock.calls[0][0].where;
    expect(where.estado).toBe("CAPTADO");
  });

  // El invariante del board: las sesiones de revisión y las corridas del runner
  // no son consultantes reales y no pueden aparecer como casos accionables.
  it("filtra por conversaciones reales", async () => {
    await listarCaptados(DESDE);
    const where = prismaMock.prisma.caso.findMany.mock.calls[0][0].where;
    expect(where.conversation).toMatchObject({ esRevision: false });
    expect(where.createdAt).toEqual({ gte: DESDE });
  });

  it("rango 'todo' (desde null) no aplica cota de fecha", async () => {
    await listarCaptados(null);
    const where = prismaMock.prisma.caso.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toBeUndefined();
    expect(where.conversation).toMatchObject({ esRevision: false });
  });

  it("un caso sin mensajes persistidos no rompe el listado", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);
    const captados = await listarCaptados(DESDE);
    expect(captados[0]?.ultimoMensaje).toBeNull();
  });

  it("sin captados no consulta los mensajes", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([]);
    expect(await listarCaptados(DESDE)).toEqual([]);
    expect(prismaMock.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("ordena por último mensaje descendente, y los que no tienen van al final", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([
      filaCaso({ conversationId: "viejo", conversation: { threadId: "chat-viejo" } }),
      filaCaso({ conversationId: "sin-mensajes", conversation: { threadId: "chat-mudo" } }),
      filaCaso({ conversationId: "reciente", conversation: { threadId: "chat-reciente" } }),
    ]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-viejo", ultimoMensaje: new Date("2026-07-26T09:00:00.000Z") },
      { threadId: "chat-reciente", ultimoMensaje: new Date("2026-07-31T09:00:00.000Z") },
    ]);

    const captados = await listarCaptados(DESDE);

    expect(captados.map((caso) => caso.conversationId)).toEqual(["reciente", "viejo", "sin-mensajes"]);
  });

  // Un contacto parcial es lo normal: el agente registra lo que consigue, y el
  // caso pasa a CAPTADO con un solo dato. La fila tiene que sobrevivir igual.
  it("un contacto parcial conserva los campos vacíos como null", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([
      filaCaso({ contactoNombre: "Ana", contactoTelefono: null, contactoEmail: null }),
    ]);

    const captados = await listarCaptados(DESDE);

    expect(captados[0]).toMatchObject({
      contactoNombre: "Ana",
      contactoTelefono: null,
      contactoEmail: null,
    });
  });
});
