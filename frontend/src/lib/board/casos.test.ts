import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: { caso: { findMany: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { listarCasos } from "./casos";

function filaCaso(overrides: Record<string, unknown> = {}) {
  return {
    id: "caso-1",
    conversationId: "conv-1",
    gestion: "NUEVO",
    estado: "CAPTADO",
    categoria: "laboral",
    subcategorias: ["despido"],
    contactoNombre: "Ana Pérez",
    contactoTelefono: "099111222",
    contactoEmail: "ana@example.com",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-08T10:00:00.000Z"),
    conversation: { threadId: "chat-1" },
    sintesis: { contenido: { situacion: "La despidieron sin causa." } },
    ...overrides,
  };
}

const FILTROS = { rango: "30d" } as const;

describe("listarCasos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.prisma.caso.findMany.mockResolvedValue([filaCaso()]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-1", ultimoMensaje: new Date("2026-08-09T14:00:00.000Z") },
    ]);
  });

  it("arma la fila con gestión, contacto y situación", async () => {
    const pagina = await listarCasos(FILTROS);

    expect(pagina.casos).toEqual([
      {
        id: "caso-1",
        conversationId: "conv-1",
        fecha: "2026-08-01T10:00:00.000Z",
        ultimaActividad: "2026-08-09T14:00:00.000Z",
        gestion: "NUEVO",
        estado: "CAPTADO",
        categoria: "laboral",
        subcategorias: ["despido"],
        contactoNombre: "Ana Pérez",
        contactoTelefono: "099111222",
        contactoEmail: "ana@example.com",
        situacion: "La despidieron sin causa.",
      },
    ]);
  });

  // El alcance no se escribe inline en ningún lado: sale de casosReales.
  it("excluye las sesiones de revisión", async () => {
    await listarCasos(FILTROS);

    const [{ where }] = prismaMock.prisma.caso.findMany.mock.calls[0] as [
      { where: { conversation?: { esRevision?: boolean } } },
    ];
    expect(where.conversation?.esRevision).toBe(false);
  });

  it("pasa los filtros de gestión, estado y categoría a la query", async () => {
    await listarCasos({ rango: "30d", gestion: "DERIVADO", estado: "CAPTADO", categoria: "familia" });

    const [{ where }] = prismaMock.prisma.caso.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where).toMatchObject({ gestion: "DERIVADO", estado: "CAPTADO", categoria: "familia" });
  });

  it("busca el texto de contacto en los tres campos", async () => {
    await listarCasos({ rango: "30d", contacto: "ana" });

    const [{ where }] = prismaMock.prisma.caso.findMany.mock.calls[0] as [
      { where: { OR?: unknown[] } },
    ];
    expect(where.OR).toHaveLength(3);
  });

  // Sin síntesis guardada la celda queda vacía: generarla acá sería una
  // llamada al modelo por fila, y la bandeja dejaría de abrir.
  it("un caso sin síntesis sirve situacion null", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([filaCaso({ sintesis: null })]);

    const pagina = await listarCasos(FILTROS);
    expect(pagina.casos[0]?.situacion).toBeNull();
  });

  it("un thread sin mensajes cae a la fecha de actualización del caso", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);

    const pagina = await listarCasos(FILTROS);
    expect(pagina.casos[0]?.ultimaActividad).toBe("2026-08-08T10:00:00.000Z");
  });

  it("sin filas no consulta los mensajes", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([]);

    expect(await listarCasos(FILTROS)).toEqual({ casos: [], cursor: null });
    expect(prismaMock.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  // La página se ordena por `ultimaActividad`, no por el orden en que Prisma
  // devolvió las filas (que es por `createdAt`, la columna del cursor). Sin
  // este reorden, gestionar un caso viejo lo dejaría con un `ultimaActividad`
  // reciente pero en el medio de la tabla.
  it("ordena la página por última actividad, no por creación", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([
      filaCaso({
        id: "caso-viejo",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        updatedAt: new Date("2026-08-01T10:00:00.000Z"),
        conversation: { threadId: "chat-viejo" },
      }),
      filaCaso({
        id: "caso-nuevo",
        createdAt: new Date("2026-08-05T10:00:00.000Z"),
        updatedAt: new Date("2026-08-05T10:00:00.000Z"),
        conversation: { threadId: "chat-nuevo" },
      }),
    ]);
    // El caso más viejo por creación tuvo actividad más reciente (se gestionó
    // hoy) — la fila tiene que aparecer primero igual.
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-viejo", ultimoMensaje: new Date("2026-08-10T09:00:00.000Z") },
      { threadId: "chat-nuevo", ultimoMensaje: new Date("2026-08-05T11:00:00.000Z") },
    ]);

    const pagina = await listarCasos(FILTROS);

    expect(pagina.casos.map((caso) => caso.id)).toEqual(["caso-viejo", "caso-nuevo"]);
  });

  // El cursor de "Cargar más" tiene que apoyarse en la columna que ordena la
  // query de Prisma (`createdAt`), no en `updatedAt`: paginar por una columna
  // que gestionar mueve hace que la página siguiente repita una fila y omita
  // otra para siempre.
  it("pagina por createdAt, no por updatedAt", async () => {
    await listarCasos(FILTROS);

    const [{ orderBy }] = prismaMock.prisma.caso.findMany.mock.calls[0] as [
      { orderBy: Record<string, unknown> },
    ];
    expect(orderBy).toEqual({ createdAt: "desc" });
  });

  it("devuelve cursor solo cuando la página vino llena", async () => {
    const llena = Array.from({ length: 30 }, (_, indice) =>
      filaCaso({ id: `caso-${indice}`, conversation: { threadId: `chat-${indice}` } }),
    );
    prismaMock.prisma.caso.findMany.mockResolvedValue(llena);

    const pagina = await listarCasos(FILTROS);
    expect(pagina.cursor).toBe("caso-29");
  });
});
