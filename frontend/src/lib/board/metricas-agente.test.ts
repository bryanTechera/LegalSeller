import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/prisma", () => prismaMock);

import { calcularAgente, calcularVolumen } from "./metricas-agente";

const DESDE = new Date("2026-07-25T00:00:00.000Z");

describe("calcularAgente", () => {
  beforeEach(() => {
    // resetAllMocks (no clearAllMocks): calcularAgente hace 3 llamadas
    // posicionales a $queryRaw encoladas con mockResolvedValueOnce.
    // clearAllMocks solo limpia mock.calls, no el once-queue pendiente — un
    // test que reencola valores frescos (más abajo) heredaría los 3 de este
    // beforeEach por delante de los suyos y consumiría los equivocados.
    vi.resetAllMocks();
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([
        { modelo: "google/gemini-3-flash", tokensEntrada: 2_000_000, tokensSalida: 500_000 },
      ])
      .mockResolvedValueOnce([{ tool: "buscar-documentos", llamadas: 120 }])
      .mockResolvedValueOnce([{ p50Ms: 1800, p95Ms: 7400 }]);
  });

  it("adjunta el costo estimado a cada modelo", async () => {
    const agente = await calcularAgente(DESDE);
    expect(agente.modelos[0]).toEqual({
      modelo: "google/gemini-3-flash",
      tokensEntrada: 2_000_000,
      tokensSalida: 500_000,
      costoUsd: 0.3 * 2 + 2.5 * 0.5,
    });
  });

  it("devuelve tools y latencia", async () => {
    const agente = await calcularAgente(DESDE);
    expect(agente.tools).toEqual([{ tool: "buscar-documentos", llamadas: 120 }]);
    expect(agente.latencia).toEqual({ p50Ms: 1800, p95Ms: 7400 });
  });

  it("sin spans devuelve latencia en cero en vez de romper", async () => {
    vi.resetAllMocks();
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const agente = await calcularAgente(DESDE);
    expect(agente.latencia).toEqual({ p50Ms: 0, p95Ms: 0 });
  });

  // Mismo guard que el de metricas-funnel.test.ts: el SQL crudo no lo
  // ejecuta ningún test (Prisma está mockeado), así que al menos se asegura
  // que las tres queries traigan el join scopeado — sin esto, borrar
  // JOIN_REALES de una query no rompería nada visible.
  it("las tres queries usan el join scopeado", async () => {
    await calcularAgente(DESDE);
    for (const llamada of prismaMock.prisma.$queryRaw.mock.calls) {
      expect(JSON.stringify(llamada)).toContain("esRevision");
    }
  });
});

describe("calcularVolumen", () => {
  beforeEach(() => {
    vi.resetAllMocks(); // ver nota en calcularAgente sobre por qué no clearAllMocks
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([{ fecha: "2026-07-30", valor: 12 }])
      .mockResolvedValueOnce([{ hora: 14, conversaciones: 9 }])
      .mockResolvedValueOnce([{ mensajesPorConversacion: 6.4, tasaAbandono: 0.25 }]);
  });

  it("devuelve la serie diaria, la franja horaria y los agregados", async () => {
    expect(await calcularVolumen(DESDE)).toEqual({
      porDia: [{ fecha: "2026-07-30", valor: 12 }],
      porHora: [{ hora: 14, conversaciones: 9 }],
      mensajesPorConversacion: 6.4,
      tasaAbandono: 0.25,
    });
  });

  it("sin datos devuelve ceros en vez de romper", async () => {
    vi.resetAllMocks();
    prismaMock.prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    expect(await calcularVolumen(DESDE)).toEqual({
      porDia: [],
      porHora: [],
      mensajesPorConversacion: 0,
      tasaAbandono: 0,
    });
  });

  // Las tres queries de calcularVolumen parten de "Conversation" sin join
  // (o con mastra colgando de un LEFT JOIN opcional), así que ninguna puede
  // usar JOIN_REALES — necesitan WHERE_REALES. Mismo guard anti-regresión.
  it("las tres queries usan la condición scopeada", async () => {
    await calcularVolumen(DESDE);
    for (const llamada of prismaMock.prisma.$queryRaw.mock.calls) {
      expect(JSON.stringify(llamada)).toContain("esRevision");
    }
  });
});
