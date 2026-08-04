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

    fireEvent.click(screen.getByRole("button", { name: "Contame un poco más sobre tu antigüedad" }));

    expect(screen.getByText("despido sin causa indemnización")).toBeInTheDocument();
    expect(screen.queryByText("plazo de reclamo por despido")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Contame un poco más sobre tu antigüedad" }));
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre la búsqueda/ }));

    expect(screen.getByRole("tab", { name: "Notas (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Texto de la nota")).toBeInTheDocument();
    expect(screen.getByText(citaDeBusqueda(busquedaConFuente))).toBeInTheDocument();
  });
});
