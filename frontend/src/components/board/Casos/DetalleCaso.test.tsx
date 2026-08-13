import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import useSWR from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetalleConversacion } from "@/lib/board/conversaciones";
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

const conversacionBase: DetalleConversacion = {
  id: "conv-1",
  threadId: "thread-1",
  categoria: "laboral",
  fecha: "2026-08-08T10:00:00.000Z",
  timeline: [
    {
      tipo: "mensaje",
      id: "m1",
      rol: "user",
      texto: "me despidieron sin causa después de 6 años",
      fecha: "2026-08-08T10:00:00.000Z",
    },
  ],
  busquedas: [],
  casos: [],
  notas: [],
  intentosExtraccion: 0,
  reglasExtraccion: [],
};

/**
 * En la vista de chat conviven dos useSWR: el del caso (esta ficha) y el de la
 * conversación (ConversacionCaso). Un mock que devuelve lo mismo para toda key
 * le daría el caso al hijo y explotaría — el mock discrimina por URL, que de
 * paso verifica que el hijo pide la conversación correcta.
 */
function mockCasoYConversacion(datos: Caso) {
  vi.mocked(useSWR).mockImplementation((key: unknown) => {
    const url = typeof key === "string" ? key : "";
    const data = url.includes("/conversaciones/") ? conversacionBase : datos;
    return {
      data,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSWR>;
  });
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
    // El chat ya no manda al tab Chats: se abre dentro de la misma ficha.
    expect(screen.getByRole("link", { name: /ver chat/i })).toHaveAttribute(
      "href",
      "/board/casos/caso-1?vista=chat",
    );
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
  it("muestra los dos estados como badges en el encabezado", () => {
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

    // Los dos ejes van rotulados: "captado" lo escribe el agente y
    // "Contactado" el equipo, y sueltos se leen como si fueran el mismo dato.
    expect(screen.getByText("Estado: Captado")).toBeInTheDocument();
    expect(screen.getByText("Gestión: Contactado")).toBeInTheDocument();
  });

  // Cada subcategoría es su propio badge: unidas por " · " en un solo nodo, ni
  // se pueden estilar ni se leen como la lista de temas que son.
  it("muestra cada subcategoría como un badge propio", () => {
    mockCaso({ ...casoBase, subcategorias: ["despido", "rubros-laborales"] });
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("despido")).toBeInTheDocument();
    expect(screen.getByText("rubros-laborales")).toBeInTheDocument();
  });

  it("un caso sin subcategorías lo dice en vez de dejar la fila vacía", () => {
    mockCaso({ ...casoBase, subcategorias: [] });
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("sin subcategorías")).toBeInTheDocument();
  });

  it("las fechas, el autor del cambio y el acceso al chat viven en la tarjeta de contacto", () => {
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

    const contacto = within(screen.getByRole("region", { name: "Contacto" }));
    expect(contacto.getByText("Abierto")).toBeInTheDocument();
    expect(contacto.getByText("Última actividad")).toBeInTheDocument();
    expect(contacto.getByText(/ana@estudio\.uy/)).toBeInTheDocument();
    // Sigue siendo un enlace aunque se vea como botón: el estado vive en la
    // URL, y así conserva abrir en pestaña nueva (y el E2E de casos.spec.ts
    // que lo busca por rol).
    expect(contacto.getByRole("link", { name: "Ver chat completo" })).toHaveAttribute(
      "href",
      "/board/casos/caso-1?vista=chat",
    );
  });

  // El intercambio de vistas es el punto del cambio: la conversación ocupa el
  // lugar del resumen y NADA más de la pantalla se mueve.
  it("con vista=chat cambia el resumen por la conversación y deja el resto igual", () => {
    mockCasoYConversacion(casoBase);
    render(<DetalleCaso id="caso-1" vista="chat" />);

    expect(screen.queryByRole("heading", { name: "Resumen del caso" })).not.toBeInTheDocument();
    expect(screen.getByText(/me despidieron sin causa/)).toBeInTheDocument();

    // Lo que tiene que seguir en su lugar.
    expect(screen.getByRole("heading", { name: "Conversación" })).toBeInTheDocument();
    expect(screen.getByText("Gestión: Nuevo")).toBeInTheDocument();
    expect(screen.getByText("despido")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Contacto" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notas del equipo legal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gestionar" })).toBeInTheDocument();
  });

  it("el mismo control alterna entre las dos vistas", () => {
    mockCasoYConversacion(casoBase);
    const { unmount } = render(<DetalleCaso id="caso-1" vista="resumen" />);

    expect(screen.getByRole("link", { name: "Ver chat completo" })).toHaveAttribute(
      "href",
      "/board/casos/caso-1?vista=chat",
    );

    unmount();
    mockCasoYConversacion(casoBase);
    render(<DetalleCaso id="caso-1" vista="chat" />);

    expect(screen.getByRole("link", { name: "Ver resumen del caso" })).toHaveAttribute(
      "href",
      "/board/casos/caso-1",
    );
  });

  it("un caso sin gestionar muestra el badge pero no la fila de autor", () => {
    mockCaso(casoBase);
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("Gestión: Nuevo")).toBeInTheDocument();
    expect(screen.queryByText("Marcado por")).not.toBeInTheDocument();
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
