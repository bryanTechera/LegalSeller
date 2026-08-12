import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { caso: { findFirst: vi.fn() } },
}));
vi.mock("./sintesis", () => ({ asegurarSintesis: vi.fn() }));
const gestionMock = vi.hoisted(() => ({ leerGestion: vi.fn() }));
vi.mock("./gestion", () => gestionMock);

import { prisma } from "@/lib/prisma";

import { obtenerCaso } from "./caso-detalle";
import { asegurarSintesis } from "./sintesis";

const fila = {
  id: "caso-1",
  conversationId: "conv-1",
  categoria: "laboral",
  subcategorias: ["despido"],
  estado: "CAPTADO",
  contactoNombre: "Ana",
  contactoTelefono: "099111222",
  contactoEmail: null,
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  updatedAt: new Date("2026-08-08T10:00:00.000Z"),
  notas: [
    { id: "nota-1", autor: "ana@estudio.uy", texto: "Tiene el telegrama.", createdAt: new Date("2026-08-08T12:00:00.000Z") },
  ],
};

describe("obtenerCaso", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gestionMock.leerGestion.mockResolvedValue({
      estado: "NUEVO",
      nota: null,
      por: null,
      en: null,
      historial: [],
    });
  });

  it("devuelve el caso con contacto, fechas, notas y síntesis", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "sin-sintesis" });

    const detalle = await obtenerCaso("caso-1");

    expect(detalle).toMatchObject({ id: "caso-1", conversationId: "conv-1", contactoNombre: "Ana" });
    expect(detalle?.notas[0]?.texto).toBe("Tiene el telegrama.");
    expect(detalle?.creadoEn).toBe("2026-08-01T10:00:00.000Z");
  });

  // Una falla de la síntesis no puede impedir ver el caso: el contacto es lo
  // único accionable y tiene que llegar igual.
  it("devuelve el caso aunque la síntesis falle", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "error", sintesis: null, generadaEn: null });

    const detalle = await obtenerCaso("caso-1");

    expect(detalle?.contactoTelefono).toBe("099111222");
    expect(detalle?.sintesis.estado).toBe("error");
  });

  // asegurarSintesis absorbe el fallo del backend de IA (estado: "error"),
  // pero tiene rutas internas no blindadas (construirTimeline con
  // filaMensajeSchema.parse, upserts de Prisma) que pueden tirar en vez de
  // resolver. El contacto tiene que llegar igual.
  it("devuelve el caso aunque asegurarSintesis rechace la promesa", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockRejectedValue(new Error("timeline rota"));

    const detalle = await obtenerCaso("caso-1");

    expect(detalle?.contactoTelefono).toBe("099111222");
    expect(detalle?.sintesis).toEqual({ estado: "error", sintesis: null, generadaEn: null });
  });

  it("devuelve null para un caso inexistente o de sesión de revisión", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(null as never);

    expect(await obtenerCaso("caso-x")).toBeNull();
    expect(asegurarSintesis).not.toHaveBeenCalled();
  });

  // El invariante del board, medido sobre el `where` y no sobre un findFirst
  // mockeado a null: un mock que devuelve null pasa igual sin el filtro, y el
  // detalle pasaría a servir casos de /revision y del runner de escenarios.
  it("pide el caso filtrando por conversaciones reales", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "sin-sintesis" });

    await obtenerCaso("caso-1");

    const where = vi.mocked(prisma.caso.findFirst).mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({ id: "caso-1", conversation: { esRevision: false } });
  });

  it("incluye la gestión vigente con su historial", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "sin-sintesis" });
    gestionMock.leerGestion.mockResolvedValue({
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

    const caso = await obtenerCaso("caso-1");

    expect(caso?.gestion.estado).toBe("CONTACTADO");
    expect(caso?.gestion.historial).toHaveLength(1);
  });

  // La ficha tiene que renderizar aunque la gestión no se pueda leer: el
  // contacto y la síntesis son lo que el abogado necesita para trabajar.
  it("sin gestión legible sirve el caso con el estado por defecto", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "sin-sintesis" });
    gestionMock.leerGestion.mockResolvedValue(null);

    const caso = await obtenerCaso("caso-1");

    expect(caso?.gestion).toEqual({ estado: "NUEVO", nota: null, por: null, en: null, historial: [] });
  });
});
