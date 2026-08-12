import { beforeEach, describe, expect, it, vi } from "vitest";

// Mismo shim que clasificacion.test.ts: `tx` es el mismo objeto que recibe
// el callback de `$transaction`, y `prisma` lo spreadea para que las lecturas
// post-transacción (`armarGestion`, llamada fuera del `$transaction` en
// `actualizarGestion`, y `leerGestion`) pasen por los mismos mocks.
const tx = vi.hoisted(() => ({
  caso: { updateMany: vi.fn(), findFirst: vi.fn() },
  casoEvento: { create: vi.fn(), findMany: vi.fn() },
}));
const transaction = vi.hoisted(() => vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)));
vi.mock("@/lib/prisma", () => ({ prisma: { ...tx, $transaction: transaction } }));

import { actualizarGestion, leerGestion } from "./gestion";

const CASO = {
  id: "caso-1",
  gestion: "CONTACTADO",
  gestionNota: "Le escribí por WhatsApp.",
  gestionPor: "ana@estudio.uy",
  gestionEn: new Date("2026-08-11T12:00:00.000Z"),
};

const EVENTO = {
  id: "ev-1",
  payload: { de: "NUEVO", a: "CONTACTADO", nota: "Le escribí por WhatsApp.", por: "ana@estudio.uy" },
  createdAt: new Date("2026-08-11T12:00:00.000Z"),
};

describe("actualizarGestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.caso.findFirst.mockResolvedValue({ id: "caso-1", gestion: "NUEVO" });
    tx.caso.updateMany.mockResolvedValue({ count: 1 });
    tx.casoEvento.create.mockResolvedValue(EVENTO);
    tx.casoEvento.findMany.mockResolvedValue([EVENTO]);
  });

  it("escribe el estado y deja el evento con el estado anterior", async () => {
    tx.caso.findFirst
      .mockResolvedValueOnce({ id: "caso-1", gestion: "NUEVO" })
      .mockResolvedValueOnce(CASO);

    const gestion = await actualizarGestion({
      casoId: "caso-1",
      gestion: "CONTACTADO",
      nota: "Le escribí por WhatsApp.",
      por: "ana@estudio.uy",
    });

    expect(tx.casoEvento.create).toHaveBeenCalledWith({
      data: {
        casoId: "caso-1",
        tipo: "GESTION",
        payload: { de: "NUEVO", a: "CONTACTADO", nota: "Le escribí por WhatsApp.", por: "ana@estudio.uy" },
      },
      select: { id: true, payload: true, createdAt: true },
    });
    // El guard de alcance tiene que viajar en el where de las tres queries
    // sobre Caso — no alcanza con que findFirst/updateMany "se llamen".
    expect(tx.caso.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversation: { esRevision: false } }),
      }),
    );
    expect(tx.caso.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversation: { esRevision: false } }),
      }),
    );
    expect(gestion).toEqual({
      estado: "CONTACTADO",
      nota: "Le escribí por WhatsApp.",
      por: "ana@estudio.uy",
      en: "2026-08-11T12:00:00.000Z",
      historial: [
        {
          id: "ev-1",
          de: "NUEVO",
          a: "CONTACTADO",
          nota: "Le escribí por WhatsApp.",
          por: "ana@estudio.uy",
          createdAt: "2026-08-11T12:00:00.000Z",
        },
      ],
    });
  });

  // El guard vive en la query, no en la UI: un caso de sesión de revisión no
  // se gestiona ni conociendo su id.
  it("un caso inexistente o de revisión devuelve null sin escribir evento", async () => {
    tx.caso.findFirst.mockResolvedValue(null);

    expect(
      await actualizarGestion({ casoId: "caso-x", gestion: "DERIVADO", por: "ana@estudio.uy" }),
    ).toBeNull();
    expect(tx.caso.updateMany).not.toHaveBeenCalled();
    expect(tx.casoEvento.create).not.toHaveBeenCalled();
  });

  // Carrera: el caso existía al leerlo y dejó de estar en alcance al escribir.
  it("si el update no afecta filas no deja evento huérfano", async () => {
    tx.caso.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await actualizarGestion({ casoId: "caso-1", gestion: "DERIVADO", por: "ana@estudio.uy" }),
    ).toBeNull();
    expect(tx.casoEvento.create).not.toHaveBeenCalled();
  });

  it("sin nota guarda null, no un string vacío", async () => {
    tx.caso.findFirst
      .mockResolvedValueOnce({ id: "caso-1", gestion: "NUEVO" })
      .mockResolvedValueOnce({ ...CASO, gestion: "DERIVADO", gestionNota: null });

    await actualizarGestion({ casoId: "caso-1", gestion: "DERIVADO", nota: "  ", por: "ana@estudio.uy" });

    expect(tx.caso.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gestionNota: null }) }),
    );
  });

  // Las tres operaciones (leer el previo, escribir el estado, dejar el
  // evento) tienen que vivir en la MISMA transacción: si el `create` del
  // evento falla, Prisma revierte también el `updateMany` que ya corrió en
  // esa conexión. La prueba de que están atadas es que el error del create
  // se propaga sin que la función lo atenúe ni devuelva una gestión — un
  // catch acá adentro (o hacer el updateMany fuera de la transacción)
  // dejaría la columna cambiada sin ningún evento que la explique.
  it("un fallo del create no deja la columna cambiada — el error se propaga desde la transacción", async () => {
    tx.casoEvento.create.mockRejectedValue(new Error("blip de conexión"));

    await expect(
      actualizarGestion({ casoId: "caso-1", gestion: "DERIVADO", por: "ana@estudio.uy" }),
    ).rejects.toThrow("blip de conexión");

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("leerGestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.caso.findFirst.mockResolvedValue(CASO);
    tx.casoEvento.findMany.mockResolvedValue([EVENTO]);
  });

  it("devuelve el estado vigente con su historial", async () => {
    const gestion = await leerGestion("caso-1");
    expect(gestion?.estado).toBe("CONTACTADO");
    expect(gestion?.historial).toHaveLength(1);
    // Misma red que en actualizarGestion: el guard tiene que estar en el
    // where, no solo confiado a que el mock devuelva lo que el test quiere.
    expect(tx.caso.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ conversation: { esRevision: false } }),
      }),
    );
  });

  // Un payload con forma inesperada (evento escrito por una versión vieja) no
  // puede tumbar la ficha entera: se sirve con los campos que se entienden.
  it("tolera un payload de evento con forma inesperada", async () => {
    tx.casoEvento.findMany.mockResolvedValue([
      { id: "ev-2", payload: "texto suelto", createdAt: new Date("2026-08-11T13:00:00.000Z") },
    ]);

    const gestion = await leerGestion("caso-1");
    expect(gestion?.historial).toEqual([
      { id: "ev-2", de: null, a: "", nota: null, por: "", createdAt: "2026-08-11T13:00:00.000Z" },
    ]);
  });

  it("un caso fuera de alcance devuelve null", async () => {
    tx.caso.findFirst.mockResolvedValue(null);
    expect(await leerGestion("caso-x")).toBeNull();
  });
});
