import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: { conversation: { findMany: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { listarConversaciones } from "./conversaciones";

function filaConversacion(id: string) {
  return {
    id,
    threadId: `chat-${id}`,
    categoria: "laboral",
    createdAt: new Date("2026-07-30T10:00:00.000Z"),
    caso: { estado: "CAPTADO" },
    _count: { notas: 2 },
  };
}

describe("listarConversaciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.findMany.mockResolvedValue([filaConversacion("c1")]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-c1", mensajes: 6, preview: "Me despidieron sin causa" },
    ]);
  });

  it("filtra siempre por conversaciones reales", async () => {
    await listarConversaciones({ rango: "30d" });
    const where = prismaMock.prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ esRevision: false });
  });

  it("combina la fila de negocio con el conteo y el preview de mensajes", async () => {
    const resultado = await listarConversaciones({ rango: "30d" });
    expect(resultado.chats).toEqual([
      {
        id: "c1",
        fecha: "2026-07-30T10:00:00.000Z",
        categoria: "laboral",
        estadoCaso: "CAPTADO",
        mensajes: 6,
        preview: "Me despidieron sin causa",
        notas: 2,
      },
    ]);
  });

  it("una conversación sin mensajes persistidos no rompe el listado", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);
    const resultado = await listarConversaciones({ rango: "30d" });
    expect(resultado.chats[0]).toMatchObject({ mensajes: 0, preview: "" });
  });

  it("el filtro de estado se aplica sobre el caso", async () => {
    await listarConversaciones({ rango: "30d", estado: "CAPTADO" });
    const where = prismaMock.prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.caso).toMatchObject({ estado: "CAPTADO" });
  });

  it("devuelve cursor null cuando la página no está llena", async () => {
    const resultado = await listarConversaciones({ rango: "30d" });
    expect(resultado.cursor).toBeNull();
  });

  // La búsqueda tiene que acotar ANTES de paginar: si filtrara después, un
  // match fuera de las 30 más recientes no aparecería nunca.
  it("con búsqueda restringe el findMany a los threads que matchean", async () => {
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([{ threadId: "chat-c9" }])
      .mockResolvedValueOnce([{ threadId: "chat-c9", mensajes: 4, preview: "Me despidieron" }]);
    prismaMock.prisma.conversation.findMany.mockResolvedValue([filaConversacion("c9")]);

    await listarConversaciones({ rango: "30d", busqueda: "despido" });

    const where = prismaMock.prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.threadId).toEqual({ in: ["chat-c9"] });
  });

  it("búsqueda sin coincidencias devuelve vacío sin consultar conversaciones", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValueOnce([]);
    prismaMock.prisma.conversation.findMany.mockClear();

    const resultado = await listarConversaciones({ rango: "30d", busqueda: "inexistente" });

    expect(resultado).toEqual({ chats: [], cursor: null });
    expect(prismaMock.prisma.conversation.findMany).not.toHaveBeenCalled();
  });
});
