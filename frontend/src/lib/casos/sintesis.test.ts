import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    caso: { findFirst: vi.fn() },
    sintesisCaso: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/agent-service", () => ({ pedirSintesis: vi.fn() }));
vi.mock("@/lib/revision/timeline", () => ({ construirTimeline: vi.fn() }));

import { pedirSintesis } from "@/lib/agent-service";
import { prisma } from "@/lib/prisma";
import { construirTimeline } from "@/lib/revision/timeline";

import { asegurarSintesis } from "./sintesis";

const sintesis = {
  situacion: "Despido sin causa tras seis años.",
  hechos: [],
  datosClave: [],
  pedido: "Saber qué le corresponde.",
  faltantes: [],
};

const timeline = [
  { tipo: "mensaje" as const, id: "m1", rol: "user" as const, texto: "Me despidieron", fecha: "2026-08-08T10:00:00.000Z" },
  { tipo: "mensaje" as const, id: "m2", rol: "assistant" as const, texto: "Contame más", fecha: "2026-08-08T10:01:00.000Z" },
];

function casoConSintesis(huella: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: "caso-1",
    categoria: "laboral",
    subcategorias: ["despido"],
    resumen: { brief: "Despido" },
    contactoNombre: "Ana",
    contactoTelefono: null,
    contactoEmail: null,
    estado: "CAPTADO",
    createdAt: new Date("2026-08-08T09:00:00.000Z"),
    conversation: { threadId: "thread-1" },
    ...overrides,
    sintesis:
      huella === null
        ? null
        : { contenido: sintesis, huella, modelo: "google/gemini-3.5-flash-lite", generadaEn: new Date("2026-08-08T11:00:00.000Z") },
  };
}

describe("asegurarSintesis", () => {
  beforeEach(() => {
    // resetAllMocks y no clearAllMocks: clear deja viva la cola de
    // mockResolvedValueOnce y se filtra entre tests.
    vi.resetAllMocks();
    vi.mocked(construirTimeline).mockResolvedValue(timeline);
  });

  it("devuelve la síntesis guardada sin llamar al backend cuando la huella coincide", async () => {
    // Primero se genera para conocer la huella vigente de este material.
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(null) as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);
    await asegurarSintesis("caso-1");
    const huellaVigente = vi.mocked(prisma.sintesisCaso.upsert).mock.calls[0]?.[0].create.huella as string;

    vi.resetAllMocks();
    vi.mocked(construirTimeline).mockResolvedValue(timeline);
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(huellaVigente) as never);

    const resultado = await asegurarSintesis("caso-1");

    expect(pedirSintesis).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ estado: "ok", vigente: true });
  });

  it("regenera y persiste cuando la huella no coincide", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis("huella-vieja") as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);

    const resultado = await asegurarSintesis("caso-1");

    expect(pedirSintesis).toHaveBeenCalledTimes(1);
    expect(prisma.sintesisCaso.upsert).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ estado: "ok", vigente: true });
  });

  it("con `forzar` regenera aunque la huella coincida", async () => {
    // Igual que el primer test: se genera una vez para conocer la huella
    // vigente de este material, y recién ahí se monta un hit real — si no,
    // "cualquiera" nunca coincide con calcularHuella y el test pasaría
    // aunque se borrara el chequeo de `forzar` en el código.
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(null) as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);
    await asegurarSintesis("caso-1");
    const huellaVigente = vi.mocked(prisma.sintesisCaso.upsert).mock.calls[0]?.[0].create.huella as string;

    vi.resetAllMocks();
    vi.mocked(construirTimeline).mockResolvedValue(timeline);
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(huellaVigente) as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);

    await asegurarSintesis("caso-1", { forzar: true });

    expect(pedirSintesis).toHaveBeenCalledTimes(1);
  });

  // La síntesis es una comodidad: un backend caído no puede dejar sin vista al
  // caso, y lo viejo es mejor que nada mientras se marque como desactualizado.
  it("ante un error del backend conserva la síntesis vieja y la marca no vigente", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis("huella-vieja") as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "error", mensaje: "No se pudo generar la síntesis" });

    const resultado = await asegurarSintesis("caso-1");

    expect(prisma.sintesisCaso.upsert).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ estado: "error" });
    if (resultado.estado !== "error") return;
    expect(resultado.sintesis?.situacion).toBe(sintesis.situacion);
  });

  it("sin caso devuelve sin-sintesis y no llama a nadie", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(null as never);

    expect(await asegurarSintesis("no-existe")).toEqual({ estado: "sin-sintesis" });
    expect(pedirSintesis).not.toHaveBeenCalled();
  });

  it("no resume una conversación sin mensajes", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(null) as never);
    vi.mocked(construirTimeline).mockResolvedValue([]);

    expect(await asegurarSintesis("caso-1")).toEqual({ estado: "sin-sintesis" });
    expect(pedirSintesis).not.toHaveBeenCalled();
  });

  // Medido sobre el `where`: con findFirst mockeado a null, "sin caso devuelve
  // sin-sintesis" pasa igual aunque se borre el filtro, y la síntesis pasaría
  // a generarse (y facturarse) sobre conversaciones de /revision.
  it("busca el caso filtrando por conversaciones reales", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis("huella-vieja") as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);

    await asegurarSintesis("caso-1");

    const where = vi.mocked(prisma.caso.findFirst).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: "caso-1", conversation: { esRevision: false } });
  });
});

/**
 * El material es lo único que el modelo ve: entre "se llamó a pedirSintesis" y
 * "el fetch salió", el argumento no tenía cobertura, y una mutación que mandara
 * `mensajes: []` o perdiera el resumen del caso pasaba toda la suite.
 */
describe("asegurarSintesis — el material que recibe el modelo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(construirTimeline).mockResolvedValue(timeline);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);
  });

  async function materialDe(overrides: Record<string, unknown> = {}) {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis("huella-vieja", overrides) as never);
    await asegurarSintesis("caso-1");
    return vi.mocked(pedirSintesis).mock.calls[0]?.[0];
  }

  it("manda el transcript completo, en orden, con su rol y su fecha", async () => {
    const material = await materialDe();

    expect(material?.mensajes).toEqual([
      { rol: "user", texto: "Me despidieron", fecha: "2026-08-08T10:00:00.000Z" },
      { rol: "assistant", texto: "Contame más", fecha: "2026-08-08T10:01:00.000Z" },
    ]);
  });

  // La timeline mezcla mensajes con tool calls y spans de agente: si dejáramos
  // pasar esos ítems, el modelo leería mecánica interna como si fuera relato.
  it("deja fuera de los mensajes lo que no es un mensaje de la timeline", async () => {
    vi.mocked(construirTimeline).mockResolvedValue([
      timeline[0],
      { tipo: "tool-call", spanId: "s1", tool: "buscar-documentos", fecha: "2026-08-08T10:00:30.000Z" },
      timeline[1],
    ] as never);

    const material = await materialDe();

    expect(material?.mensajes).toHaveLength(2);
    expect(material?.mensajes.map((mensaje) => mensaje.rol)).toEqual(["user", "assistant"]);
  });

  it("manda los campos del caso, con la fecha de apertura como anclaje", async () => {
    const material = await materialDe();

    expect(material?.caso).toEqual({
      categoria: "laboral",
      subcategorias: ["despido"],
      estado: "CAPTADO",
      resumen: "Despido",
      abiertoEn: "2026-08-08T09:00:00.000Z",
    });
  });

  it("aplana `Caso.resumen` con brief, con hechos y con los dos", async () => {
    expect((await materialDe({ resumen: { brief: "Despido sin causa" } }))?.caso.resumen).toBe("Despido sin causa");

    vi.mocked(pedirSintesis).mockClear();
    expect((await materialDe({ resumen: { hechos: "6 años de antigüedad" } }))?.caso.resumen).toBe(
      "6 años de antigüedad",
    );

    vi.mocked(pedirSintesis).mockClear();
    const conLosDos = await materialDe({
      resumen: { brief: "Despido sin causa", hechos: "6 años de antigüedad", temaDetectado: "despido" },
    });
    // El orden es el del lector, no el del Json: brief, tema, hechos.
    expect(conLosDos?.caso.resumen).toBe("Despido sin causa\ndespido\n6 años de antigüedad");
  });

  it("un resumen con forma desconocida o vacío viaja como null, no como '[object Object]'", async () => {
    expect((await materialDe({ resumen: { otraCosa: { anidado: 1 } } }))?.caso.resumen).toBeNull();

    vi.mocked(pedirSintesis).mockClear();
    expect((await materialDe({ resumen: null }))?.caso.resumen).toBeNull();

    vi.mocked(pedirSintesis).mockClear();
    expect((await materialDe({ resumen: { brief: "   " } }))?.caso.resumen).toBeNull();
  });

  it("un `Caso.resumen` que ya es string pasa tal cual", async () => {
    expect((await materialDe({ resumen: "Texto plano viejo" }))?.caso.resumen).toBe("Texto plano viejo");
  });
});
