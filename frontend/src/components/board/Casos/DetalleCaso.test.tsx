import { render, screen, waitFor } from "@testing-library/react";
import useSWR from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DetalleCaso as Caso } from "@/lib/casos/caso-detalle";
import type { Sintesis } from "@/lib/casos/sintesis-schema";

import { DetalleCaso } from "./DetalleCaso";

// Mismo patrón que DetalleChat.test.tsx: se mockea el default export de swr y
// cada test controla { data, error, isLoading, mutate } sin pegarle a la red.
vi.mock("swr", () => ({ default: vi.fn() }));

const sintesisContenido: Sintesis = {
  situacion: "La despidieron sin causa tras seis años.",
  hechos: [{ cuando: "2026-07-15", que: "Le comunicaron la desvinculación." }],
  datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
  pedido: "Saber qué le corresponde cobrar.",
  faltantes: ["Último salario nominal"],
};

const casoBase: Caso = {
  id: "caso-1",
  conversationId: "conv-1",
  categoria: "laboral",
  subcategorias: ["despido"],
  estado: "CAPTADO",
  contactoNombre: "Ana Pérez",
  contactoTelefono: "099111222",
  contactoEmail: "ana@example.com",
  creadoEn: "2026-08-01T10:00:00.000Z",
  actualizadoEn: "2026-08-08T10:00:00.000Z",
  sintesis: {
    estado: "ok",
    vigente: true,
    generadaEn: "2026-08-08T11:00:00.000Z",
    sintesis: sintesisContenido,
  },
  notas: [{ id: "nota-1", autor: "ana@estudio.uy", texto: "Tiene el telegrama.", createdAt: "2026-08-08T12:00:00.000Z" }],
};

function mockCaso(datos: Caso | undefined, error?: Error) {
  vi.mocked(useSWR).mockReturnValue({
    data: datos,
    error,
    isLoading: datos === undefined && error === undefined,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useSWR>);
}

describe("DetalleCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("muestra el resumen, el contacto y el enlace al chat", () => {
    mockCaso(casoBase);
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText(/La despidieron sin causa/)).toBeInTheDocument();
    expect(screen.getByText("6 años")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver chat/i })).toHaveAttribute("href", "/board/chats/conv-1");
  });

  it("muestra las notas del equipo legal con su autor", () => {
    mockCaso(casoBase);
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("Tiene el telegrama.")).toBeInTheDocument();
    expect(screen.getByText(/ana@estudio.uy/)).toBeInTheDocument();
  });

  // El contacto es lo único accionable: tiene que llegar aunque el resumen no.
  it("renderiza el caso con un aviso cuando la síntesis falló", () => {
    mockCaso({ ...casoBase, sintesis: { estado: "error", sintesis: null, generadaEn: null } });
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/no pudimos generar/i);
  });

  it("avisa cuando la síntesis quedó desactualizada", () => {
    mockCaso({
      ...casoBase,
      sintesis: {
        estado: "ok",
        vigente: false,
        generadaEn: "2026-08-08T11:00:00.000Z",
        sintesis: sintesisContenido,
      },
    });
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText(/desactualizad/i)).toBeInTheDocument();
  });

  it("muestra un error si el caso no carga", async () => {
    mockCaso(undefined, new Error("No pudimos cargar el caso"));
    render(<DetalleCaso id="caso-x" />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
