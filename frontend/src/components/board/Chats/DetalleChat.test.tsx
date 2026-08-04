import { fireEvent, render, screen, within } from "@testing-library/react";
import useSWR from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DetalleConversacion } from "@/lib/board/conversaciones";
import { citaDeBusqueda, type BusquedaCorpus } from "@/lib/revision/fuentes";

import { DetalleChat } from "./DetalleChat";

// No hay precedente en el repo para mockear swr: se mockea el default export
// y cada test controla { data, error, isLoading, mutate } directamente, sin
// pegarle a la red.
vi.mock("swr", () => ({ default: vi.fn() }));

const busquedaConFuente: BusquedaCorpus = {
  spanId: "s1",
  messageId: "a1",
  agente: "laboral",
  consulta: "despido sin causa indemnización",
  categoria: "laboral",
  subcategorias: ["despido"],
  estado: "ok",
  fragmentos: [
    {
      documentId: "d1",
      documentTitle: "Ley 10.489",
      section: "art. 4",
      content: "El empleador que despida sin causa deberá abonar una indemnización.",
      similarity: 0.79,
    },
  ],
  fecha: "2026-08-04T10:01:00.000Z",
};

const busquedaVacia: BusquedaCorpus = {
  spanId: "s2",
  messageId: "a2",
  agente: "laboral",
  consulta: "plazo de reclamo por despido",
  categoria: "laboral",
  subcategorias: [],
  estado: "empty",
  fragmentos: [],
  fecha: "2026-08-04T10:02:00.000Z",
};

const detalleBase: DetalleConversacion = {
  id: "c1",
  threadId: "t1",
  categoria: "laboral",
  fecha: "2026-08-04T10:00:00.000Z",
  timeline: [
    {
      tipo: "mensaje",
      id: "u1",
      rol: "user",
      texto: "Me despidieron sin causa",
      fecha: "2026-08-04T10:00:00.000Z",
    },
    {
      tipo: "mensaje",
      id: "a1",
      rol: "assistant",
      texto: "Contame un poco más sobre tu antigüedad",
      fecha: "2026-08-04T10:01:00.000Z",
    },
    {
      tipo: "mensaje",
      id: "a2",
      rol: "assistant",
      texto: "No encontré nada sobre ese plazo puntual",
      fecha: "2026-08-04T10:02:00.000Z",
    },
    {
      tipo: "turno-agente",
      spanId: "run1",
      agente: "laboral",
      fecha: "2026-08-04T10:00:30.000Z",
    },
    {
      tipo: "tool-call",
      spanId: "t1",
      tool: "buscar-documentos",
      agente: "laboral",
      input: null,
      output: null,
      error: null,
      fecha: "2026-08-04T10:00:31.000Z",
    },
    {
      tipo: "tool-call",
      spanId: "t2",
      tool: "registrar-caso",
      agente: "laboral",
      input: null,
      output: null,
      error: null,
      fecha: "2026-08-04T10:00:32.000Z",
    },
    {
      tipo: "generacion",
      spanId: "g1",
      modelo: "openai/gpt-5.6-luna",
      tokensEntrada: 1000,
      tokensSalida: 500,
      fecha: "2026-08-04T10:00:33.000Z",
    },
  ],
  busquedas: [busquedaConFuente, busquedaVacia],
  caso: {
    estado: "EN_PROGRESO",
    categoria: "laboral",
    subcategorias: ["despido"],
    resumen: null,
    contactoNombre: "Juan Pérez",
    contactoTelefono: "099123456",
    contactoEmail: null,
    eventos: [],
  },
  notas: [
    {
      id: "n1",
      messageId: "a1",
      citaTexto: "seis mensualidades",
      autor: "Dra. García",
      texto: "El tope son 6, revisar.",
      estado: "ABIERTA",
      createdAt: "2026-07-20T12:00:00.000Z",
      respuestas: [],
    },
  ],
};

function mockDatos(datos: DetalleConversacion) {
  vi.mocked(useSWR).mockReturnValue({
    data: datos,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useSWR>);
}

describe("DetalleChat", () => {
  beforeEach(() => {
    mockDatos(detalleBase);
  });

  it("la marca aparece bajo una respuesta del agente y no bajo un mensaje del usuario", () => {
    render(<DetalleChat id="c1" />);

    const liUsuario = screen.getByText("Me despidieron sin causa").closest("li");
    expect(liUsuario).not.toBeNull();
    expect(within(liUsuario as HTMLElement).queryByText(/consulta/)).not.toBeInTheDocument();

    const liAgente = screen.getByText("Contame un poco más sobre tu antigüedad").closest("li");
    expect(liAgente).not.toBeNull();
    expect(within(liAgente as HTMLElement).getByText("1 consulta · 1 fragmento")).toBeInTheDocument();
  });

  it("una respuesta con búsqueda vacía muestra la marca en estilo de alerta", () => {
    render(<DetalleChat id="c1" />);

    const liAgente = screen.getByText("No encontré nada sobre ese plazo puntual").closest("li");
    expect(liAgente).not.toBeNull();
    expect(within(liAgente as HTMLElement).getByText(/sin resultados/)).toBeInTheDocument();
  });

  it("clic en una respuesta del agente muestra su consulta en la solapa Fuentes", () => {
    render(<DetalleChat id="c1" />);

    fireEvent.click(screen.getByRole("button", { name: /1 consulta · 1 fragmento/ }));

    expect(screen.getByText("despido sin causa indemnización")).toBeInTheDocument();
    expect(screen.queryByText("plazo de reclamo por despido")).not.toBeInTheDocument();
  });

  // La burbuja del agente NO es un botón: su nombre accesible ya no es el
  // mensaje entero, y el texto queda seleccionable con el mouse. El clic que
  // selecciona la respuesta vive en la marca (WCAG 2.5.3 — ver hallazgo 5).
  it("la burbuja del agente es texto plano; el control que selecciona la respuesta es la marca", () => {
    render(<DetalleChat id="c1" />);

    expect(screen.queryByRole("button", { name: "Contame un poco más sobre tu antigüedad" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "1 consulta · 1 fragmento: ver fuentes de esta respuesta" }),
    ).toBeInTheDocument();
  });

  it("«Dejar nota» de un mensaje abre el composer aunque la solapa activa no sea Notas", () => {
    render(<DetalleChat id="c1" />);

    // Parado en la solapa por defecto (Fuentes) — no se toca la solapa a mano.
    expect(screen.getByRole("tab", { name: "Fuentes" })).toHaveAttribute("aria-selected", "true");

    const liUsuario = screen.getByText("Me despidieron sin causa").closest("li");
    expect(liUsuario).not.toBeNull();
    fireEvent.click(within(liUsuario as HTMLElement).getByRole("button", { name: "Dejar nota" }));

    expect(screen.getByRole("tab", { name: "Notas (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Texto de la nota")).toBeInTheDocument();
    // El texto aparece dos veces: en el mensaje de la timeline y en la cita
    // precargada del composer (blockquote) — confirma que se cargó la cita.
    expect(screen.getAllByText("Me despidieron sin causa")).toHaveLength(2);
  });

  it("las tres solapas existen como tabs y cambiar de solapa muestra el contenido correspondiente", () => {
    render(<DetalleChat id="c1" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Fuentes", "Caso", "Notas (1)"]);

    fireEvent.click(screen.getByRole("tab", { name: "Caso" }));
    expect(screen.getByRole("tab", { name: "Caso" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Notas (1)" }));
    expect(screen.getByRole("tab", { name: "Notas (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Nota sobre la conversación" })).toBeInTheDocument();
    expect(screen.getByText("El tope son 6, revisar.")).toBeInTheDocument();
  });

  it("anotar desde el panel de fuentes salta a la solapa Notas con el composer abierto y la cita cargada", () => {
    render(<DetalleChat id="c1" />);

    fireEvent.click(screen.getByRole("button", { name: /1 consulta · 1 fragmento/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre esta búsqueda/ }));

    expect(screen.getByRole("tab", { name: "Notas (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Texto de la nota")).toBeInTheDocument();
    expect(screen.getByText(citaDeBusqueda(busquedaConFuente))).toBeInTheDocument();
  });

  it("la timeline no rinde trazas técnicas: ni 'turno de', ni la línea de tokens", () => {
    render(<DetalleChat id="c1" />);

    expect(screen.queryByText(/turno de/)).not.toBeInTheDocument();
    expect(screen.queryByText(/entrada \/ 500 salida/)).not.toBeInTheDocument();
    expect(screen.queryByText("registrar-caso")).not.toBeInTheDocument();
  });

  it("el bloque «Detalle técnico» de la solapa Caso resume agentes, modelos, tokens, costo y otras herramientas", () => {
    render(<DetalleChat id="c1" />);

    fireEvent.click(screen.getByRole("tab", { name: "Caso" }));

    const detalle = screen.getByText("Detalle técnico").closest("details");
    expect(detalle).not.toBeNull();
    const dentro = within(detalle as HTMLElement);

    expect(dentro.getByText("laboral")).toBeInTheDocument();
    expect(dentro.getByText("openai/gpt-5.6-luna")).toBeInTheDocument();
    expect(dentro.getByText("1000 entrada / 500 salida")).toBeInTheDocument();
    expect(dentro.getByText("US$ 0.0008")).toBeInTheDocument();
    expect(dentro.getByText("registrar-caso")).toBeInTheDocument();
  });
});
