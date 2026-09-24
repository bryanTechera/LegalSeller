import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/prisma", () => prismaMock);

import { calcularVisitas } from "./metricas-visitas";

const DESDE = new Date("2026-09-16T00:00:00.000Z");

/** Reconstruye el SQL del tagged template, fragmentos anidados incluidos. */
function sqlDe(llamada: unknown[]): string {
  const [strings, ...valores] = llamada as [readonly string[], ...unknown[]];
  return Prisma.sql(strings, ...valores).sql;
}

describe("calcularVisitas", () => {
  beforeEach(() => vi.resetAllMocks());

  it("separa el total de las filas por origen", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { origen: null, visitantes: 150, escribieron: 3 },
      { origen: "instagram", visitantes: 140, escribieron: 2 },
      { origen: "directo", visitantes: 10, escribieron: 1 },
    ]);

    expect(await calcularVisitas(DESDE)).toEqual({
      visitantes: 150,
      escribieron: 3,
      porOrigen: [
        { origen: "instagram", visitantes: 140, escribieron: 2 },
        { origen: "directo", visitantes: 10, escribieron: 1 },
      ],
    });
  });

  it("sin visitas devuelve ceros, no un error", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);
    expect(await calcularVisitas(DESDE)).toEqual({ visitantes: 0, escribieron: 0, porOrigen: [] });
  });

  // "Escribió" se mide contra conversaciones reales: una sesión de revisión
  // del equipo legal no es un visitante que convirtió.
  it("cuenta como escritura solo una conversación real con actividad posterior a la visita", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);
    await calcularVisitas(DESDE);
    const sql = sqlDe(prismaMock.prisma.$queryRaw.mock.calls[0] as unknown[]);
    expect(sql).toContain(`c."esRevision" = false`);
    expect(sql).toContain(`c."ultimaActividad" >= v."createdAt"`);
  });
});
