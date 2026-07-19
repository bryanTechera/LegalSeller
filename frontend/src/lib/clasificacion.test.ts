import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  conversation: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  caso: { create: vi.fn(), upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  casoEvento: { create: vi.fn(), count: vi.fn() },
}));
vi.mock("./prisma", () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) },
}));

import { asignarClasificacion, corregirClasificacion, getOrCreateConversation, registrarDatosCaso } from "./clasificacion";

describe("asignarClasificacion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("first-write-wins: no pisa una categoría ya asignada", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral" });
    const result = await asignarClasificacion({ sessionId: "s1", categoria: "familia" });
    expect(result).toEqual({ categoria: "laboral", aplicada: false });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("asigna, crea el caso y registra el evento CLASIFICACION", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.findUnique.mockResolvedValue(null);
    tx.caso.create.mockResolvedValue({ id: "k1" });
    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "laboral",
      subcategoria: "despido",
      brief: "despido sin liquidación",
    });
    expect(result.aplicada).toBe(true);
    expect(tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", categoria: null },
        data: expect.objectContaining({ categoria: "laboral" }),
      }),
    );
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CLASIFICACION" }) }),
    );
  });

  it("escape fuera de cobertura: no asigna categoría de ruteo, marca el caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.findUnique.mockResolvedValue(null);
    tx.caso.create.mockResolvedValue({ id: "k1" });
    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });
    expect(result).toEqual({ categoria: null, aplicada: false });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoria: null, estado: "FUERA_DE_COBERTURA", origen: "FUERA_DE_COBERTURA" }),
      }),
    ); // demand signal recorded
  });

  it("promueve un caso escapado cuando llega una clasificación real (Critical 1)", async () => {
    // Turno 1: escape — crea el caso congelado.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.findUnique.mockResolvedValue(null);
    tx.caso.create.mockResolvedValue({ id: "k1" });
    const primero = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });
    expect(primero).toEqual({ categoria: null, aplicada: false });

    vi.clearAllMocks();

    // Turno 2: llega la clasificación real — la conversación sigue sin
    // categoria (el escape nunca la fija) y el caso ya existe con el estado
    // congelado del escape.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.findUnique.mockResolvedValue({ id: "k1", subcategorias: [], resumen: null });
    tx.caso.update.mockResolvedValue({ id: "k1" });
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });

    const segundo = await asignarClasificacion({
      sessionId: "s1",
      categoria: "laboral",
      subcategoria: "despido",
    });

    expect(segundo).toEqual({ categoria: "laboral", aplicada: true });
    expect(tx.caso.upsert).not.toHaveBeenCalled();
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        data: expect.objectContaining({
          categoria: "laboral",
          estado: "EN_CONVERSACION",
          origen: "DOMINIO",
          subcategorias: ["despido"],
        }),
      }),
    );
  });

  it("no duplica una subcategoria ya presente al promover", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.findUnique.mockResolvedValue({ id: "k1", subcategorias: ["despido"], resumen: { brief: "previo" } });
    tx.caso.update.mockResolvedValue({ id: "k1" });

    await asignarClasificacion({ sessionId: "s1", categoria: "laboral", subcategoria: "despido", brief: "nuevo" });

    const data = tx.caso.update.mock.calls[0][0].data;
    expect(data.subcategorias).toBeUndefined(); // ya estaba, no se reenvía
    expect(data.resumen).toEqual({ brief: "nuevo" }); // se actualiza sin perder otras claves (no había otras)
  });

  it("tolera P2002 en la creación inaugural del caso (dos requests concurrentes)", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.findUnique
      .mockResolvedValueOnce(null) // esta transacción todavía no ve el caso
      .mockResolvedValueOnce({ id: "k1", subcategorias: [], resumen: null }); // recuperación: caso del ganador
    tx.caso.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    tx.caso.update.mockResolvedValue({ id: "k1" });
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });

    const result = await asignarClasificacion({ sessionId: "s1", categoria: "laboral" });

    expect(result).toEqual({ categoria: "laboral", aplicada: true });
    expect(tx.caso.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "k1" }, data: expect.objectContaining({ categoria: "laboral" }) }),
    );
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CLASIFICACION" }) }),
    );
  });

  it("relanza errores de caso.create que no son P2002", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.findUnique.mockResolvedValue(null);
    tx.caso.create.mockRejectedValue(new Error("db down"));

    await expect(asignarClasificacion({ sessionId: "s1", categoria: "laboral" })).rejects.toThrow("db down");
  });
});

describe("registrarDatosCaso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mergea subcategorias y resumen existentes sin pisar otras claves", async () => {
    tx.conversation.findUnique.mockResolvedValue({
      id: "c1",
      categoria: "laboral",
      caso: { id: "k1", subcategorias: ["despido"], resumen: { hechos: "previo", intereses: "interes-existente" } },
    });

    await registrarDatosCaso({ sessionId: "s1", subcategorias: ["indemnizacion"], hechos: "nuevo hecho" });

    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        data: expect.objectContaining({
          subcategorias: ["despido", "indemnizacion"],
          resumen: expect.objectContaining({
            hechos: "previo\nnuevo hecho",
            intereses: "interes-existente", // no clobbered by the unrelated update
          }),
        }),
      }),
    );
  });

  it("no borra campos existentes cuando los params llegan undefined explícitamente", async () => {
    tx.conversation.findUnique.mockResolvedValue({
      id: "c1",
      categoria: "laboral",
      caso: { id: "k1", subcategorias: [], resumen: {} },
    });

    await registrarDatosCaso({ sessionId: "s1", hechos: "algo", contactoNombre: undefined });

    const data = tx.caso.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("contactoNombre");
    expect(data).not.toHaveProperty("contactoTelefono");
    expect(data).not.toHaveProperty("contactoEmail");
  });

  it("transiciona a CAPTADO y registra evento CONTACTO cuando llega cualquier dato de contacto", async () => {
    tx.conversation.findUnique.mockResolvedValue({
      id: "c1",
      categoria: "laboral",
      caso: { id: "k1", subcategorias: [], resumen: {} },
    });

    await registrarDatosCaso({ sessionId: "s1", contactoEmail: "persona@example.com" });

    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "CAPTADO", contactoEmail: "persona@example.com" }) }),
    );
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CONTACTO" }) }),
    );
  });

  it("registra evento REGISTRO_DATO cuando no hay dato de contacto", async () => {
    tx.conversation.findUnique.mockResolvedValue({
      id: "c1",
      categoria: "laboral",
      caso: { id: "k1", subcategorias: [], resumen: {} },
    });

    await registrarDatosCaso({ sessionId: "s1", hechos: "algo" });

    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "REGISTRO_DATO" }) }),
    );
  });
});

describe("corregirClasificacion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aplica la corrección cuando el guard atómico la permite (count 1)", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", caso: { id: "k1" } });
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });

    const result = await corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "x" });

    expect(result).toEqual({ aplicada: true });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", correccionAplicada: false },
        data: expect.objectContaining({ correccionAplicada: true, categoria: "familia" }),
      }),
    );
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CORRECCION" }) }),
    );
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "k1" }, data: { categoria: "familia" } }),
    );
  });

  it("no aplica una segunda corrección: el updateMany guardado devuelve count 0", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", caso: { id: "k1" } });
    tx.conversation.updateMany.mockResolvedValue({ count: 0 });

    const result = await corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "x" });

    expect(result).toEqual({ aplicada: false });
    expect(tx.casoEvento.create).not.toHaveBeenCalled();
    expect(tx.caso.update).not.toHaveBeenCalled();
  });

  it("no hace nada si la conversación no tiene caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", caso: null });

    const result = await corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "x" });

    expect(result).toEqual({ aplicada: false });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });
});

describe("getOrCreateConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hace upsert por sessionId y devuelve id/categoria", async () => {
    tx.conversation.upsert.mockResolvedValue({ id: "c1", categoria: null });

    const result = await getOrCreateConversation("s1");

    expect(result).toEqual({ id: "c1", categoria: null });
    expect(tx.conversation.upsert).toHaveBeenCalledWith({
      where: { sessionId: "s1" },
      create: { sessionId: "s1", threadId: "chat-s1" },
      update: {},
      select: { id: true, categoria: true },
    });
  });
});
