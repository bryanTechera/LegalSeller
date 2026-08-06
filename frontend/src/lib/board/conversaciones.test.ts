import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: { conversation: { findMany: vi.fn(), findFirst: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock("@/lib/prisma", () => prismaMock);

// conversaciones.ts también usa extraerTexto (de este mismo módulo) para el
// preview de listarConversaciones — un mock que reemplaza el módulo entero
// rompe esas 8 pruebas existentes. importOriginal conserva extraerTexto real
// y solo intercepta construirTimeline, que es lo nuevo que necesita este test.
const timelineMock = vi.hoisted(() => ({ construirTimeline: vi.fn() }));
vi.mock("@/lib/revision/timeline", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/revision/timeline")>();
  return { ...actual, construirTimeline: timelineMock.construirTimeline };
});

const sesionesMock = vi.hoisted(() => ({ getCasosDeSesion: vi.fn() }));
vi.mock("@/lib/revision/sesiones", () => sesionesMock);

const notasMock = vi.hoisted(() => ({ listarNotasDeSesion: vi.fn() }));
vi.mock("@/lib/revision/notas", () => notasMock);

const busquedasMock = vi.hoisted(() => ({ construirBusquedas: vi.fn() }));
vi.mock("@/lib/revision/busquedas", () => busquedasMock);

import { listarConversaciones, obtenerConversacion } from "./conversaciones";

function filaConversacion(id: string) {
  return {
    id,
    threadId: `chat-${id}`,
    categoria: "laboral",
    createdAt: new Date("2026-07-30T10:00:00.000Z"),
    casos: [{ estado: "CAPTADO" }],
    _count: { notas: 2 },
    intentosExtraccion: 0,
    reglasExtraccion: [],
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
        // Sin fila de mensajes con ultimaActividad (mock por defecto de este
        // describe), cae al createdAt de la conversación.
        ultimaActividad: "2026-07-30T10:00:00.000Z",
        categoria: "laboral",
        estadoCaso: "CAPTADO",
        casos: 1,
        mensajes: 6,
        preview: "Me despidieron sin causa",
        notas: 2,
        intentosExtraccion: 0,
        reglasExtraccion: [],
      },
    ]);
  });

  it("el listado expone el contador de intentos de extracción", async () => {
    // El preview del listado es el primer mensaje del usuario, así que un
    // red-team que arranca con una consulta legítima y recién después pivotea
    // no se distingue de una conversación normal sin este contador.
    prismaMock.prisma.conversation.findMany.mockResolvedValue([
      { ...filaConversacion("c1"), intentosExtraccion: 2, reglasExtraccion: ["proveedor", "infra"] },
    ]);
    const { chats } = await listarConversaciones({ rango: "30d" });
    expect(chats[0]).toMatchObject({ intentosExtraccion: 2, reglasExtraccion: ["proveedor", "infra"] });
  });

  it("ordena por última actividad, no por creación", async () => {
    prismaMock.prisma.conversation.findMany.mockResolvedValue([
      { ...filaConversacion("nueva-inactiva"), createdAt: new Date("2026-08-04T10:00:00.000Z") },
      { ...filaConversacion("vieja-activa"), createdAt: new Date("2026-08-01T10:00:00.000Z") },
    ]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      {
        threadId: "chat-nueva-inactiva",
        mensajes: 2,
        preview: "hola",
        ultimaActividad: new Date("2026-08-04T10:05:00.000Z"),
      },
      {
        threadId: "chat-vieja-activa",
        mensajes: 8,
        preview: "me despidieron",
        ultimaActividad: new Date("2026-08-05T13:08:00.000Z"),
      },
    ]);

    const pagina = await listarConversaciones({ rango: "30d" });

    expect(pagina.chats.map((chat) => chat.id)).toEqual(["vieja-activa", "nueva-inactiva"]);
  });

  it("marca CAPTADO el chat que tiene al menos un caso captado", async () => {
    prismaMock.prisma.conversation.findMany.mockResolvedValue([
      { ...filaConversacion("c1"), casos: [{ estado: "EN_CONVERSACION" }, { estado: "CAPTADO" }] },
    ]);
    const pagina = await listarConversaciones({ rango: "30d" });
    expect(pagina.chats[0]).toMatchObject({ estadoCaso: "CAPTADO", casos: 2 });
  });

  it("una conversación sin mensajes persistidos no rompe el listado", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);
    const resultado = await listarConversaciones({ rango: "30d" });
    expect(resultado.chats[0]).toMatchObject({ mensajes: 0, preview: "" });
  });

  it("el filtro de estado se aplica sobre el caso", async () => {
    await listarConversaciones({ rango: "30d", estado: "CAPTADO" });
    const where = prismaMock.prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.casos).toMatchObject({ some: { estado: "CAPTADO" } });
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

  // Regression guard: una regex que borra "format"/"parts"/"type"/"text" como
  // ruido JSON también se come esas palabras cuando las escribe el consultante.
  it("el preview conserva palabras como 'text' que no son claves JSON", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-c1", mensajes: 3, preview: "le mande un text a mi jefe avisando que renunciaba" },
    ]);

    const resultado = await listarConversaciones({ rango: "30d" });

    expect(resultado.chats[0]?.preview).toBe("le mande un text a mi jefe avisando que renunciaba");
  });

  it("el preview de un mensaje v2 con parts devuelve solo el texto", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      {
        threadId: "chat-c1",
        mensajes: 3,
        preview: JSON.stringify({ format: 2, parts: [{ type: "text", text: "Hola, tengo una consulta" }] }),
      },
    ]);

    const resultado = await listarConversaciones({ rango: "30d" });

    expect(resultado.chats[0]?.preview).toBe("Hola, tengo una consulta");
  });
});

describe("obtenerConversacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.findFirst.mockResolvedValue({
      id: "c1",
      threadId: "chat-c1",
      categoria: "laboral",
      createdAt: new Date("2026-07-30T10:00:00.000Z"),
    });
    timelineMock.construirTimeline.mockResolvedValue([{ tipo: "mensaje", id: "m1" }]);
    sesionesMock.getCasosDeSesion.mockResolvedValue([{ id: "k1", esActivo: true, estado: "CAPTADO" }]);
    notasMock.listarNotasDeSesion.mockResolvedValue([]);
    busquedasMock.construirBusquedas.mockResolvedValue([
      { spanId: "t1", messageId: "m1", agente: "laboral", consulta: "indemnización por despido", categoria: "laboral", subcategorias: ["despido"], estado: "ok", fragmentos: [], fecha: "2026-07-30T10:00:04.000Z" },
    ]);
  });

  it("arma el detalle con timeline, caso y notas", async () => {
    const detalle = await obtenerConversacion("c1");
    expect(detalle).toMatchObject({
      id: "c1",
      threadId: "chat-c1",
      categoria: "laboral",
      timeline: [{ tipo: "mensaje", id: "m1" }],
      casos: [{ id: "k1", esActivo: true, estado: "CAPTADO" }],
      notas: [],
    });
  });

  it("pide la timeline con spans", async () => {
    await obtenerConversacion("c1");
    expect(timelineMock.construirTimeline).toHaveBeenCalledWith("chat-c1", { conSpans: true });
  });

  // Una sesión de revisión no es un chat de consultante: no se sirve por acá.
  it("una conversación de revisión no se encuentra", async () => {
    prismaMock.prisma.conversation.findFirst.mockResolvedValue(null);
    expect(await obtenerConversacion("s1")).toBeNull();
    expect(prismaMock.prisma.conversation.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "s1",
      esRevision: false,
    });
  });

  it("incluye las búsquedas al corpus del thread", async () => {
    const detalle = await obtenerConversacion("c1");
    expect(busquedasMock.construirBusquedas).toHaveBeenCalledWith("chat-c1");
    expect(detalle?.busquedas).toHaveLength(1);
    expect(detalle?.busquedas[0]).toMatchObject({ messageId: "m1", consulta: "indemnización por despido" });
  });

  // El detalle del board no renderiza ningún tool-call (las búsquedas llegan
  // por su propio camino, ya agrupadas): no tiene sentido duplicar los ~9 KB
  // de chunks del corpus que trae la timeline con spans.
  it("no devuelve el input/output de los tool-call, pero conserva el error", async () => {
    timelineMock.construirTimeline.mockResolvedValue([
      { tipo: "mensaje", id: "m1", rol: "assistant", texto: "hola", fecha: "2026-07-30T10:00:00.000Z" },
      {
        tipo: "tool-call",
        spanId: "t1",
        tool: "buscar-documentos",
        agente: "laboral",
        input: { query: "indemnización por despido" },
        output: { status: "ok", chunks: [{ content: "x".repeat(9000) }] },
        error: { message: "algo falló" },
        fecha: "2026-07-30T10:00:01.000Z",
      },
    ]);

    const detalle = await obtenerConversacion("c1");

    const toolCall = detalle?.timeline.find((item) => item.tipo === "tool-call");
    expect(toolCall).toMatchObject({ input: null, output: null, error: { message: "algo falló" } });
  });
});
