import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  // El detalle de la gestión —botones, nota e historial— vive en el modal y se
  // cubre en ModalGestion.test.tsx. Lo que la ficha sigue debiendo es el
  // resumen del encabezado y el cableado del resultado al SWR.
  it("muestra el estado de gestión y quién lo dejó así en el encabezado", () => {
    mockCaso({
      ...casoBase,
      gestion: {
        estado: "CONTACTADO",
        nota: "La llamé.",
        por: "ana@estudio.uy",
        en: "2026-08-11T12:00:00.000Z",
        historial: [],
      },
    });
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("Gestión: Contactado")).toBeInTheDocument();
    expect(screen.getByText(/Marcado por ana@estudio\.uy/)).toBeInTheDocument();
  });

  it("un caso sin gestionar muestra el badge pero no la línea de autor", () => {
    mockCaso(casoBase);
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("Gestión: Nuevo")).toBeInTheDocument();
    expect(screen.queryByText(/Marcado por/)).not.toBeInTheDocument();
  });

  // La ficha es la dueña del SWR: consume la respuesta del PATCH que le pasa el
  // modal en vez de revalidar el caso entero, que volvería a pasar por
  // obtenerCaso -> asegurarSintesis -> construirTimeline para un badge.
  it("aplica la gestión que devuelve el modal sin revalidar el caso entero", async () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: casoBase,
      error: undefined,
      isLoading: false,
      mutate,
    } as unknown as ReturnType<typeof useSWR>);
    const gestionActualizada = {
      estado: "CONTACTADO" as const,
      nota: null,
      por: "ana@estudio.uy",
      en: "2026-08-11T12:00:00.000Z",
      historial: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gestion: gestionActualizada }),
      }),
    );

    render(<DetalleCaso id="caso-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [actualizador, opcionesMutate] = mutate.mock.calls[0] as [
      (previo: Caso | undefined) => Caso | undefined,
      { revalidate: boolean },
    ];
    expect(opcionesMutate).toEqual({ revalidate: false });
    expect(actualizador(casoBase)).toEqual({ ...casoBase, gestion: gestionActualizada });
    expect(actualizador(undefined)).toBeUndefined();
  });
});
