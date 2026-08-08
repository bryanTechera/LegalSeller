import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    conversation: { count: vi.fn(), groupBy: vi.fn() },
    caso: { count: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { calcularDemanda, calcularFunnel } from "./metricas-funnel";

const DESDE = new Date("2026-07-25T00:00:00.000Z");

describe("calcularFunnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.count.mockResolvedValue(0);
    prismaMock.prisma.caso.count.mockResolvedValue(0);
  });

  it("devuelve las cuatro etapas", async () => {
    prismaMock.prisma.conversation.count
      .mockResolvedValueOnce(100) // iniciadas
      .mockResolvedValueOnce(80); // clasificadas
    prismaMock.prisma.caso.count
      .mockResolvedValueOnce(25) // captadas
      .mockResolvedValueOnce(10); // fuera de cobertura

    expect(await calcularFunnel(DESDE)).toEqual({
      iniciadas: 100,
      clasificadas: 80,
      captadas: 25,
      fueraDeCobertura: 10,
    });
  });

  // "Con caso" contaba conversaciones con un `Caso` en cualquier estado, y un
  // caso sin contacto no es accionable. Que no vuelva por la puerta de atrás.
  it("no cuenta conversaciones por tener un caso asociado", async () => {
    await calcularFunnel(DESDE);

    for (const llamada of prismaMock.prisma.conversation.count.mock.calls) {
      expect(llamada[0].where.caso).toBeUndefined();
    }
  });

  // El invariante del spec §4.1: sin esto, las pruebas del equipo legal y las
  // corridas de `pnpm escenario` inflan cada número del board.
  it("toda etapa filtra por esRevision:false", async () => {
    await calcularFunnel(DESDE);

    for (const llamada of prismaMock.prisma.conversation.count.mock.calls) {
      expect(llamada[0].where).toMatchObject({ esRevision: false });
    }
    for (const llamada of prismaMock.prisma.caso.count.mock.calls) {
      expect(llamada[0].where.conversation).toMatchObject({ esRevision: false });
    }
  });

  it("rango 'todo' (desde null) no aplica cota de fecha", async () => {
    await calcularFunnel(null);
    const primera = prismaMock.prisma.conversation.count.mock.calls[0][0];
    expect(primera.where.createdAt).toBeUndefined();
    expect(primera.where.esRevision).toBe(false);
  });
});

describe("calcularDemanda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.conversation.groupBy.mockResolvedValue([
      { categoria: "laboral", _count: { _all: 40 } },
      { categoria: "familia", _count: { _all: 12 } },
    ]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([{ subcategoria: "despido", casos: 30 }]);
    prismaMock.prisma.caso.findMany.mockResolvedValue([
      {
        id: "caso-1",
        conversationId: "c1",
        createdAt: new Date("2026-07-30T10:00:00.000Z"),
        resumen: { brief: "Consulta sobre sucesiones" },
      },
    ]);
  });

  it("agrupa categorías y descarta la categoría nula", async () => {
    prismaMock.prisma.conversation.groupBy.mockResolvedValue([
      { categoria: "laboral", _count: { _all: 40 } },
      { categoria: null, _count: { _all: 7 } },
    ]);
    const demanda = await calcularDemanda(DESDE);
    expect(demanda.categorias).toEqual([{ categoria: "laboral", conversaciones: 40 }]);
  });

  it("lista los pedidos fuera de cobertura con su resumen, no solo el conteo", async () => {
    const demanda = await calcularDemanda(DESDE);
    expect(demanda.fueraDeCobertura).toEqual([
      {
        casoId: "caso-1",
        conversationId: "c1",
        fecha: "2026-07-30T10:00:00.000Z",
        resumen: "Consulta sobre sucesiones",
      },
    ]);
  });

  // Dos pedidos de la MISMA conversación: por diseño cada tema no cubierto es
  // una fila propia, así que conversationId no identifica la fila.
  it("expone el id del caso de cada pedido fuera de cobertura", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([
      { id: "caso-1", conversationId: "c1", createdAt: new Date("2026-07-30T10:00:00.000Z"), resumen: null },
      { id: "caso-2", conversationId: "c1", createdAt: new Date("2026-07-29T10:00:00.000Z"), resumen: null },
    ]);
    const demanda = await calcularDemanda(null);
    expect(demanda.fueraDeCobertura.map((pedido) => pedido.casoId)).toEqual(["caso-1", "caso-2"]);
  });

  // Mismo guard que el del funnel: la demanda también es métrica de negocio.
  it("las queries de Prisma filtran por esRevision:false", async () => {
    await calcularDemanda(DESDE);
    expect(prismaMock.prisma.conversation.groupBy.mock.calls[0][0].where).toMatchObject({
      esRevision: false,
    });
    expect(prismaMock.prisma.caso.findMany.mock.calls[0][0].where.conversation).toMatchObject({
      esRevision: false,
    });
  });

  // El SQL crudo no lo ejecuta ningún test (Prisma está mockeado), así que al
  // menos se asegura que el fragmento con el join scopeado esté presente: sin
  // esto, borrar el JOIN_CASO_REAL no rompería nada visible.
  it("el SQL de subcategorías usa el join scopeado", async () => {
    await calcularDemanda(DESDE);
    const sql = JSON.stringify(prismaMock.prisma.$queryRaw.mock.calls[0]);
    expect(sql).toContain("esRevision");
  });
});
