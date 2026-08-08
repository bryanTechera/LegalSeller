import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { caso: { findFirst: vi.fn() } },
}));
vi.mock("./sintesis", () => ({ asegurarSintesis: vi.fn() }));

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
  beforeEach(() => vi.resetAllMocks());

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
});
