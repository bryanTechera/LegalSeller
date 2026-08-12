import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import useSWR from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  gestion: { estado: "NUEVO", nota: null, por: null, en: null, historial: [] },
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
  // Los tests de acciones (agregar nota, regenerar) stubean fetch global
  // aparte del mock de swr: sin desestubearlo se filtra a los tests que
  // corren después dentro del mismo archivo.
  afterEach(() => vi.unstubAllGlobals());

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

  // Mismo bug que ya costó producción en DetalleChat.tsx: sin el finally que
  // rehabilita el botón, una excepción de red deja el composer muerto y se
  // pierde lo tipeado.
  it("si el POST de nota rechaza, el botón de agregar nota se rehabilita y el texto se conserva", async () => {
    mockCaso(casoBase);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<DetalleCaso id="caso-1" />);

    fireEvent.change(screen.getByLabelText("Nueva nota"), { target: { value: "Habló con el testigo" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar nota" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Agregar nota" })).not.toBeDisabled());
    expect(screen.getByLabelText("Nueva nota")).toHaveValue("Habló con el testigo");
  });

  it("si el POST de nota responde no-ok, se muestra el aviso de fallo", async () => {
    mockCaso(casoBase);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    render(<DetalleCaso id="caso-1" />);

    fireEvent.change(screen.getByLabelText("Nueva nota"), { target: { value: "Habló con el testigo" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar nota" }));

    expect(await screen.findByText(/no pudimos guardar la nota/i)).toBeInTheDocument();
  });

  it("si el POST de regenerar rechaza, el botón de regenerar se rehabilita", async () => {
    mockCaso(casoBase);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    render(<DetalleCaso id="caso-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Regenerar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Regenerar" })).not.toBeDisabled());
  });

  it("muestra el estado de gestión y permite cambiarlo", async () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: casoBase,
      error: undefined,
      isLoading: false,
      mutate,
    } as unknown as ReturnType<typeof useSWR>);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<DetalleCaso id="caso-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/casos/caso-1/gestion",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, opciones] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(opciones.body)).toEqual({ gestion: "CONTACTADO", nota: "" });
    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });

  // Un cambio que no se guardó y no avisa es peor que uno que falla ruidoso:
  // el equipo cree que el lead quedó marcado y nadie lo vuelve a mirar.
  it("avisa cuando el cambio de gestión falla", async () => {
    mockCaso(casoBase);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<DetalleCaso id="caso-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Derivado" }));

    expect(await screen.findByText("No pudimos guardar el cambio. Probá de nuevo.")).toBeInTheDocument();
  });

  it("lista los cambios anteriores con autor y fecha", () => {
    mockCaso({
      ...casoBase,
      gestion: {
        estado: "DERIVADO",
        nota: "Va a Martínez.",
        por: "ana@estudio.uy",
        en: "2026-08-11T12:00:00.000Z",
        historial: [
          {
            id: "ev-1",
            de: "CONTACTADO",
            a: "DERIVADO",
            nota: "Va a Martínez.",
            por: "ana@estudio.uy",
            createdAt: "2026-08-11T12:00:00.000Z",
          },
        ],
      },
    });

    render(<DetalleCaso id="caso-1" />);

    // Scopeado a la sección de gestión: casoBase ya trae una nota del equipo
    // legal con el mismo autor (ana@estudio.uy), así que buscarlo en toda la
    // pantalla matchea dos elementos y el getByText tira "multiple elements".
    const seccionGestion = within(screen.getByRole("region", { name: "Gestión" }));
    expect(screen.getByText(/Va a Martínez\./)).toBeInTheDocument();
    expect(seccionGestion.getByText(/ana@estudio\.uy/)).toBeInTheDocument();
  });
});
