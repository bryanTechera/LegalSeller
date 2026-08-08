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

function casoConSintesis(huella: string | null) {
  return {
    id: "caso-1",
    categoria: "laboral",
    subcategorias: ["despido"],
    resumen: { brief: "Despido" },
    contactoNombre: "Ana",
    contactoTelefono: null,
    contactoEmail: null,
    estado: "CAPTADO",
    conversation: { threadId: "thread-1" },
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
});
