import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  conversation: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  caso: {
    create: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  casoEvento: { create: vi.fn(), count: vi.fn() },
}));
vi.mock("./prisma", () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) },
}));

import {
  abrirCasoFueraDeCobertura,
  abrirOReactivarCaso,
  asignarClasificacion,
  corregirClasificacion,
  getOrCreateConversation,
  registrarDatosCaso,
  resolverCasoActivo,
} from "./clasificacion";

describe("asignarClasificacion", () => {
  beforeEach(() => {
    // resetAllMocks (no clearAllMocks): varios tests de este describe encolan
    // con mockResolvedValueOnce, y clearAllMocks no vacía esa cola entre tests.
    vi.resetAllMocks();
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });
  });

  it("first-write-wins: no pisa una categoría ya asignada", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: null });
    const result = await asignarClasificacion({ sessionId: "s1", categoria: "familia" });
    expect(result).toEqual({ categoria: "laboral", aplicada: false, casoId: null, casoEstado: null });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("first-write-wins con caso activo: devuelve su id y estado", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      origen: "DOMINIO",
      subcategorias: [],
      resumen: null,
      estado: "CAPTADO",
    });
    const result = await asignarClasificacion({ sessionId: "s1", categoria: "familia" });
    expect(result).toEqual({ categoria: "laboral", aplicada: false, casoId: "k1", casoEstado: "CAPTADO" });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
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
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: null });
    tx.caso.create.mockResolvedValue({ id: "k1" });
    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });
    expect(result).toEqual({ categoria: null, aplicada: false, casoId: "k1", casoEstado: null });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k1" } });
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoria: null, estado: "FUERA_DE_COBERTURA", origen: "FUERA_DE_COBERTURA" }),
      }),
    ); // demand signal recorded
    // El escape nunca busca por clave compuesta (esEscape corta el ternario);
    // la única llamada a caso.findUnique es la relectura final del estado.
    expect(tx.caso.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.caso.findUnique).toHaveBeenCalledWith({ where: { id: "k1" }, select: { estado: true } });
  });

  it("promueve un caso escapado cuando llega una clasificación real (Critical 1)", async () => {
    // Turno 1: escape — crea el caso congelado y mueve el puntero.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: null });
    tx.caso.create.mockResolvedValue({ id: "k1" });
    const primero = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });
    expect(primero).toEqual({ categoria: null, aplicada: false, casoId: "k1", casoEstado: null });
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k1" } });

    vi.resetAllMocks();
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });

    // Turno 2: llega la clasificación real — la conversación sigue sin
    // categoria (el escape nunca la fija) pero el puntero ya apunta al caso
    // congelado del escape.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: null,
        origen: "FUERA_DE_COBERTURA",
        subcategorias: [],
        resumen: null,
        estado: "FUERA_DE_COBERTURA",
      }) // casoActivo, resuelto por casoActivoId
      .mockResolvedValueOnce(null) // casoExistente por clave compuesta: todavía no hay caso "laboral"
      .mockResolvedValueOnce({ estado: "EN_CONVERSACION" }); // relectura final tras promover
    tx.caso.update.mockResolvedValue({ id: "k1" });

    const segundo = await asignarClasificacion({
      sessionId: "s1",
      categoria: "laboral",
      subcategoria: "despido",
    });

    expect(segundo).toEqual({ categoria: "laboral", aplicada: true, casoId: "k1", casoEstado: "EN_CONVERSACION" });
    expect(tx.caso.create).not.toHaveBeenCalled();
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

  it("escape tras escape en turnos distintos reusa el caso congelado (no fragmenta la demanda)", async () => {
    // Turno 1: primer escape — crea el caso congelado y mueve el puntero.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: null });
    tx.caso.create.mockResolvedValue({ id: "k1" });
    const primero = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });
    expect(primero).toEqual({ categoria: null, aplicada: false, casoId: "k1", casoEstado: null });

    vi.resetAllMocks();
    tx.conversation.updateMany.mockResolvedValue({ count: 1 });

    // Turno 2: segundo escape (mismo tema reformulado u otro) — el puntero
    // ya apunta al caso FUERA_DE_COBERTURA congelado por el turno 1.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: null,
        origen: "FUERA_DE_COBERTURA",
        subcategorias: [],
        resumen: null,
        estado: "FUERA_DE_COBERTURA",
      }) // casoActivo, resuelto por casoActivoId
      .mockResolvedValueOnce({ estado: "FUERA_DE_COBERTURA" }); // relectura final

    const segundo = await asignarClasificacion({
      sessionId: "s1",
      categoria: "fuera-de-universo",
      temaDetectado: "sucesiones otra vez",
    });

    expect(segundo).toEqual({ categoria: null, aplicada: false, casoId: "k1", casoEstado: "FUERA_DE_COBERTURA" });
    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled(); // el puntero ya apuntaba a k1: no se mueve
  });

  it("no duplica una subcategoria ya presente al promover", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: null });
    tx.caso.findUnique.mockResolvedValue({ id: "k1", subcategorias: ["despido"], resumen: { brief: "previo" } });
    tx.caso.update.mockResolvedValue({ id: "k1" });

    await asignarClasificacion({ sessionId: "s1", categoria: "laboral", subcategoria: "despido", brief: "nuevo" });

    const data = tx.caso.update.mock.calls[0][0].data;
    expect(data.subcategorias).toBeUndefined(); // ya estaba, no se reenvía
    expect(data.resumen).toEqual({ brief: "nuevo" }); // se actualiza sin perder otras claves (no había otras)
  });

  it("tolera P2002 en la creación inaugural del caso (dos requests concurrentes)", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: null });
    tx.caso.findUnique
      .mockResolvedValueOnce(null) // esta transacción todavía no ve el caso (clave compuesta)
      .mockResolvedValueOnce({ id: "k1", subcategorias: [], resumen: null }) // recuperación: caso del ganador
      .mockResolvedValueOnce({ estado: "EN_CONVERSACION" }); // relectura final
    tx.caso.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    tx.caso.update.mockResolvedValue({ id: "k1" });

    const result = await asignarClasificacion({ sessionId: "s1", categoria: "laboral" });

    expect(result).toEqual({ categoria: "laboral", aplicada: true, casoId: "k1", casoEstado: "EN_CONVERSACION" });
    expect(tx.caso.findUnique).toHaveBeenCalledTimes(3);
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

  it("adopta el huérfano del turno inaugural en vez de crear un segundo caso (defecto E2E)", async () => {
    // El puntero ya apunta al Caso que registrar-caso creó inline, sin
    // categoría todavía (origen DOMINIO): asignar-clasificacion llega recién
    // después de drenar el stream, en el mismo turno.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: null,
        origen: "DOMINIO",
        subcategorias: [],
        resumen: { hechos: "lo despidieron sin causa" },
        estado: "EN_CONVERSACION",
      }) // casoActivo, resuelto por casoActivoId
      .mockResolvedValueOnce(null) // casoExistente por clave compuesta: todavía no hay caso "laboral"
      .mockResolvedValueOnce({ estado: "EN_CONVERSACION" }); // relectura final tras promover
    tx.caso.update.mockResolvedValue({ id: "k1" });
    // Si el predicado no adopta el huérfano, esto es lo que crea el defecto:
    // un segundo Caso con la clasificación real, huérfano abandonado aparte.
    tx.caso.create.mockResolvedValue({ id: "k2" });

    const result = await asignarClasificacion({ sessionId: "s1", categoria: "laboral", subcategoria: "despido" });

    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        data: expect.objectContaining({ categoria: "laboral", estado: "EN_CONVERSACION", origen: "DOMINIO" }),
      }),
    );
    expect(result).toEqual({ categoria: "laboral", aplicada: true, casoId: "k1", casoEstado: "EN_CONVERSACION" });
  });

  it("no devuelve al principio del funnel un caso que ya tiene contacto (hallazgo del review final)", async () => {
    // Turno 1: el receptor escapa y el usuario deja su teléfono, así que el
    // caso queda CAPTADO todavía sin categoría. Turno 2: pivotea a un tema
    // cubierto y la clasificación real adopta ese mismo caso. Si el promote
    // pisa el estado, el agente vuelve a pedir el teléfono que el usuario dio
    // un mensaje antes, y el caso deja de poder heredarle contacto al Caso N.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: null,
        origen: "DOMINIO",
        subcategorias: [],
        resumen: null,
        estado: "CAPTADO",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ estado: "CAPTADO" });
    tx.caso.update.mockResolvedValue({ id: "k1" });
    tx.caso.create.mockResolvedValue({ id: "k2" });

    const result = await asignarClasificacion({ sessionId: "s1", categoria: "laboral" });

    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoria: "laboral", origen: "DOMINIO" }) }),
    );
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ estado: expect.anything() }) }),
    );
    expect(result.casoEstado).toBe("CAPTADO");
  });

  it("marca el huérfano como escape sobre la misma fila, sin crear un segundo caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: null,
        origen: "DOMINIO",
        subcategorias: [],
        resumen: { hechos: "consulta sobre una herencia" },
        estado: "EN_CONVERSACION",
      }) // casoActivo, resuelto por casoActivoId
      .mockResolvedValueOnce({ estado: "FUERA_DE_COBERTURA" }); // relectura final
    tx.caso.update.mockResolvedValue({ id: "k1" });
    // Si el predicado no adopta el huérfano, esto es lo que crea el defecto:
    // un segundo Caso congelado aparte del huérfano.
    tx.caso.create.mockResolvedValue({ id: "k2" });

    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });

    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        data: { estado: "FUERA_DE_COBERTURA", origen: "FUERA_DE_COBERTURA" },
      }),
    );
    expect(result).toEqual({ categoria: null, aplicada: false, casoId: "k1", casoEstado: "FUERA_DE_COBERTURA" });
  });

  it("no muta un caso activo que ya tiene categoría (no-regresión)", async () => {
    // El caso activo ya tiene clasificación de registro (categoria: "laboral"):
    // una clasificación distinta que llega no debe pisarlo ni crear sobre él.
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: "laboral",
        origen: "DOMINIO",
        subcategorias: [],
        resumen: null,
        estado: "EN_CONVERSACION",
      }) // casoActivo, resuelto por casoActivoId
      .mockResolvedValueOnce(null) // casoExistente por clave compuesta: todavía no hay caso "familia"
      .mockResolvedValueOnce({ estado: "EN_CONVERSACION" }); // relectura final
    tx.caso.create.mockResolvedValue({ id: "k2" });

    const result = await asignarClasificacion({ sessionId: "s1", categoria: "familia" });

    expect(tx.caso.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "k1" } }));
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoria: "familia" }) }),
    );
    expect(result.casoId).toBe("k2");
  });
});

describe("corregirClasificacion", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sin caso activo no corrige", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: null });
    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).resolves.toEqual({
      aplicada: false,
    });
  });

  it("no corrige hacia una categoría que ya tiene caso: eso es derivar-tema", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({ id: "k1", categoria: "laboral" })
      .mockResolvedValueOnce({ id: "k2" });
    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).resolves.toEqual({
      aplicada: false,
    });
    expect(tx.caso.updateMany).not.toHaveBeenCalled();
  });

  it("corrige el caso activo con guard atómico sobre Caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValueOnce({ id: "k1", categoria: "laboral" }).mockResolvedValueOnce(null);
    tx.caso.updateMany.mockResolvedValue({ count: 1 });
    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).resolves.toEqual({
      aplicada: true,
    });
    expect(tx.caso.updateMany).toHaveBeenCalledWith({
      where: { id: "k1", correccionAplicada: false },
      data: { correccionAplicada: true, categoria: "familia" },
    });
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CORRECCION" }) }),
    );
  });

  it("no propaga P2002 cuando otra transacción crea el caso destino entre la colisión y el update (TOCTOU)", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValueOnce({ id: "k1", categoria: "laboral" }).mockResolvedValueOnce(null);
    tx.caso.updateMany.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).resolves.toEqual({
      aplicada: false,
    });
    expect(tx.casoEvento.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });

  it("relanza errores de caso.updateMany que no son P2002", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValueOnce({ id: "k1", categoria: "laboral" }).mockResolvedValueOnce(null);
    tx.caso.updateMany.mockRejectedValue(new Error("db down"));

    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).rejects.toThrow(
      "db down",
    );
  });
});

describe("registrarDatosCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("escribe sobre el caso activo y no acepta interesAdicional", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValue({ id: "k1", subcategorias: ["despido"], resumen: { hechos: "previo" } });
    await registrarDatosCaso({ sessionId: "s1", subcategorias: ["rubros-laborales"], hechos: "nuevo" });
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        data: expect.objectContaining({
          subcategorias: ["despido", "rubros-laborales"],
          resumen: { hechos: "previo\nnuevo" },
        }),
      }),
    );
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });

  it("sin caso activo abre el de la categoría persistida y mueve el puntero", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: null });
    tx.caso.upsert.mockResolvedValue({ id: "k9", subcategorias: [], resumen: null });
    await registrarDatosCaso({ sessionId: "s1", contactoNombre: "Ana" });
    expect(tx.caso.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId_categoria: { conversationId: "c1", categoria: "laboral" } },
      }),
    );
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k9" } });
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "CAPTADO" }) }),
    );
  });

  it("sin caso activo ni categoría persistida, crea con categoria null y mueve el puntero", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: null });
    tx.caso.create.mockResolvedValue({ id: "k9", subcategorias: [], resumen: null });

    await registrarDatosCaso({ sessionId: "s1", contactoNombre: "Ana" });

    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { conversationId: "c1", categoria: null } }),
    );
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k9" } });
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "k9" }, data: expect.objectContaining({ contactoNombre: "Ana" }) }),
    );
  });
});

describe("getOrCreateConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hace upsert por sessionId y devuelve id/categoria/casoActivoId", async () => {
    tx.conversation.upsert.mockResolvedValue({ id: "c1", categoria: null, casoActivoId: null });

    const result = await getOrCreateConversation("s1");

    expect(result).toEqual({ id: "c1", categoria: null, casoActivoId: null });
    expect(tx.conversation.upsert).toHaveBeenCalledWith({
      where: { sessionId: "s1" },
      create: { sessionId: "s1", threadId: "chat-s1" },
      update: {},
      select: { id: true, categoria: true, casoActivoId: true },
    });
  });
});

describe("resolverCasoActivo", () => {
  beforeEach(() => vi.resetAllMocks());

  it("devuelve null cuando la conversación todavía no tiene ningún caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: null });
    tx.caso.findFirst.mockResolvedValue(null);
    await expect(resolverCasoActivo("s1")).resolves.toBeNull();
  });

  it("resuelve el puntero a la fila del caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "CAPTADO",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    const caso = await resolverCasoActivo("s1");
    expect(caso).toEqual({
      id: "k1",
      categoria: "laboral",
      estado: "CAPTADO",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    expect(tx.caso.findFirst).not.toHaveBeenCalled();
  });

  it("auto-repara un puntero colgado adoptando el caso más reciente", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "borrado" });
    tx.caso.findUnique.mockResolvedValue(null);
    tx.caso.findFirst.mockResolvedValue({
      id: "k2",
      categoria: "familia",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    const caso = await resolverCasoActivo("s1");
    expect(caso?.id).toBe("k2");
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { casoActivoId: "k2" },
    });
  });
});

describe("abrirOReactivarCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("falso positivo: misma categoría que el caso activo es no-op", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    await expect(abrirOReactivarCaso({ sessionId: "s1", categoria: "laboral" })).resolves.toEqual({
      accion: "no-op",
      casoId: "k1",
      categoria: "laboral",
    });
    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });

  it("reactiva el caso de una categoría ya presente sin crear otro", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: "laboral",
        estado: "CAPTADO",
        origen: "DOMINIO",
        correccionAplicada: false,
      })
      .mockResolvedValueOnce({ id: "k2", categoria: "familia" });
    const resultado = await abrirOReactivarCaso({ sessionId: "s1", categoria: "familia" });
    expect(resultado).toEqual({ accion: "reactivado", casoId: "k2", categoria: "familia" });
    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k2" } });
  });

  it("crea el caso de una categoría nueva heredando el contacto: nace CAPTADO", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: "laboral",
        estado: "CAPTADO",
        origen: "DOMINIO",
        correccionAplicada: false,
      })
      .mockResolvedValueOnce(null);
    tx.caso.findFirst.mockResolvedValue({
      contactoNombre: "Ana",
      contactoTelefono: "099",
      contactoEmail: null,
    });
    tx.caso.create.mockResolvedValue({ id: "k3" });
    const resultado = await abrirOReactivarCaso({ sessionId: "s1", categoria: "transito", subcategoria: undefined });
    expect(resultado).toEqual({ accion: "creado", casoId: "k3", categoria: "transito" });
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoria: "transito",
          contactoNombre: "Ana",
          contactoTelefono: "099",
          estado: "CAPTADO",
        }),
      }),
    );
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k3" } });
  });

  it("sin contacto heredable el caso nuevo nace EN_CONVERSACION", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: "laboral",
        estado: "EN_CONVERSACION",
        origen: "DOMINIO",
        correccionAplicada: false,
      })
      .mockResolvedValueOnce(null);
    tx.caso.findFirst.mockResolvedValue(null);
    tx.caso.create.mockResolvedValue({ id: "k4" });
    await abrirOReactivarCaso({ sessionId: "s1", categoria: "familia" });
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "EN_CONVERSACION" }) }),
    );
  });
});

describe("abrirCasoFueraDeCobertura", () => {
  beforeEach(() => vi.resetAllMocks());

  it("siempre crea un caso nuevo: cada demanda no cubierta es una señal separada", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findFirst.mockResolvedValue(null);
    tx.caso.create.mockResolvedValue({ id: "k5" });
    const resultado = await abrirCasoFueraDeCobertura({ sessionId: "s1", temaDetectado: "penal" });
    expect(resultado).toEqual({ accion: "creado", casoId: "k5", categoria: null });
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoria: null,
          origen: "FUERA_DE_COBERTURA",
          estado: "FUERA_DE_COBERTURA",
        }),
      }),
    );
  });
});
