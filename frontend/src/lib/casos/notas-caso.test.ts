import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { caso: { findFirst: vi.fn() }, notaCaso: { create: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";

import { crearNotaCaso } from "./notas-caso";

describe("crearNotaCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("crea la nota sobre un caso real y devuelve su vista", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue({ id: "caso-1" } as never);
    vi.mocked(prisma.notaCaso.create).mockResolvedValue({
      id: "nota-1",
      autor: "ana@estudio.uy",
      texto: "Habló por teléfono: tiene el telegrama.",
      createdAt: new Date("2026-08-08T12:00:00.000Z"),
    } as never);

    const nota = await crearNotaCaso({ casoId: "caso-1", autor: "ana@estudio.uy", texto: "Habló por teléfono: tiene el telegrama." });

    expect(nota).toMatchObject({ id: "nota-1", autor: "ana@estudio.uy" });
    expect(nota?.createdAt).toBe("2026-08-08T12:00:00.000Z");
  });

  // Mismo guard que el resto del board: una nota sobre un caso de /revision o
  // del runner de escenarios sería una anotación sobre datos de prueba.
  it("devuelve null si el caso no existe o es de una sesión de revisión", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(null as never);

    expect(await crearNotaCaso({ casoId: "caso-x", autor: "ana@estudio.uy", texto: "algo" })).toBeNull();
    expect(prisma.notaCaso.create).not.toHaveBeenCalled();
  });

  // Medido sobre el `where`: con findFirst mockeado a null el test anterior
  // pasa igual sin el filtro, y las notas del equipo legal empezarían a
  // escribirse sobre casos de prueba de /revision.
  it("busca el caso filtrando por conversaciones reales", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue({ id: "caso-1" } as never);
    vi.mocked(prisma.notaCaso.create).mockResolvedValue({
      id: "nota-1",
      autor: "ana@estudio.uy",
      texto: "algo",
      createdAt: new Date("2026-08-08T12:00:00.000Z"),
    } as never);

    await crearNotaCaso({ casoId: "caso-1", autor: "ana@estudio.uy", texto: "algo" });

    const where = vi.mocked(prisma.caso.findFirst).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: "caso-1", conversation: { esRevision: false } });
  });
});
