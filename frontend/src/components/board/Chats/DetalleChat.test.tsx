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

  it("la respuesta del agente se rinde como markdown, no con los asteriscos crudos", () => {
    mockDatos({
      ...detalleBase,
      timeline: [
        {
          tipo: "mensaje",
          id: "a1",
          rol: "assistant",
          texto: "BPS no te paga por **solo 3 días**.",
          fecha: "2026-08-04T10:01:00.000Z",
        },
      ],
    });
    render(<DetalleChat id="c1" />);

    expect(screen.getByText("solo 3 días").tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
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

  it("sin mensaje elegido la solapa Fuentes no carga ninguna consulta", () => {
    render(<DetalleChat id="c1" />);

    expect(screen.getByText(/Elegí una respuesta del agente/)).toBeInTheDocument();
    expect(screen.queryByText("despido sin causa indemnización")).not.toBeInTheDocument();
    expect(screen.queryByText("plazo de reclamo por despido")).not.toBeInTheDocument();
  });

  it("el mensaje elegido queda marcado y «Quitar selección» lo desmarca", () => {
    render(<DetalleChat id="c1" />);
    const liAgente = screen.getByText("Contame un poco más sobre tu antigüedad").closest("li");
    expect(liAgente).not.toBeNull();
    expect(liAgente).not.toHaveAttribute("data-seleccionada");

    fireEvent.click(screen.getByRole("button", { name: /1 consulta · 1 fragmento/ }));
    expect(liAgente).toHaveAttribute("data-seleccionada", "true");
    expect(liAgente).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(liAgente).not.toHaveAttribute("data-seleccionada");
    expect(screen.getByText(/Elegí una respuesta del agente/)).toBeInTheDocument();
  });

  it("una respuesta sin consultas al corpus también se puede elegir", () => {
    mockDatos({ ...detalleBase, busquedas: [] });
    render(<DetalleChat id="c1" />);

    fireEvent.click(screen.getAllByRole("button", { name: /Sin consultas al corpus/ })[0]);

    expect(screen.getByText("Esta respuesta no consultó el corpus.")).toBeInTheDocument();
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

  it("«Dejar nota» de un mensaje lo elige, abre el composer y salta a sus notas", () => {
    render(<DetalleChat id="c1" />);

    // Parado en la solapa por defecto (Fuentes) — no se toca la solapa a mano.
    expect(screen.getByRole("tab", { name: "Fuentes" })).toHaveAttribute("aria-selected", "true");

    const liUsuario = screen.getByText("Me despidieron sin causa").closest("li");
    expect(liUsuario).not.toBeNull();
    fireEvent.click(within(liUsuario as HTMLElement).getByRole("button", { name: "Dejar nota" }));

    expect(screen.getByRole("tab", { name: "Notas del mensaje (0)" })).toHaveAttribute("aria-selected", "true");
    expect(liUsuario).toHaveAttribute("data-seleccionada", "true");
    expect(screen.getByLabelText("Texto de la nota")).toBeInTheDocument();
    // El texto aparece dos veces: en el mensaje de la timeline y en la cita
    // precargada del composer (blockquote) — confirma que se cargó la cita.
    expect(screen.getAllByText("Me despidieron sin causa")).toHaveLength(2);
  });

  it("las solapas son solo el detalle del mensaje: caso y notas de la conversación quedan fijos", () => {
    render(<DetalleChat id="c1" />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Fuentes", "Notas del mensaje (0)"]);

    // Visibles sin tocar ninguna solapa, con la solapa Fuentes activa.
    expect(screen.getByRole("heading", { name: "Caso" })).toBeInTheDocument();
    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notas de la conversación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nota sobre la conversación" })).toBeInTheDocument();
  });

  it("la nota de un mensaje vive en su solapa, no en el bloque de la conversación", () => {
    render(<DetalleChat id="c1" />);

    // n1 cuelga de a1: sin elegir ese mensaje no se muestra en ningún lado.
    expect(screen.queryByText("El tope son 6, revisar.")).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no hay notas sobre la conversación.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /1 consulta · 1 fragmento/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Notas del mensaje (1)" }));
    expect(screen.getByText("El tope son 6, revisar.")).toBeInTheDocument();
  });

  it("una nota huérfana (messageId fuera del transcript) cae en las notas de la conversación", () => {
    mockDatos({
      ...detalleBase,
      notas: [{ ...detalleBase.notas[0], id: "n9", messageId: "borrado", texto: "Nota sin mensaje" }],
    });
    render(<DetalleChat id="c1" />);

    expect(screen.getByText("Nota sin mensaje")).toBeInTheDocument();
  });

  it("las notas de la conversación se muestran de a una, con navegación", () => {
    const base = detalleBase.notas[0];
    mockDatos({
      ...detalleBase,
      notas: [
        { ...base, id: "g1", messageId: null, texto: "Primera nota general" },
        { ...base, id: "g2", messageId: null, texto: "Segunda nota general" },
      ],
    });
    render(<DetalleChat id="c1" />);

    // La solapa del mensaje no cuenta estas notas: no son de ningún mensaje.
    expect(screen.getByRole("tab", { name: "Notas del mensaje (0)" })).toBeInTheDocument();
    expect(screen.getByText("Nota 1 de 2")).toBeInTheDocument();
    expect(screen.getByText("Primera nota general")).toBeInTheDocument();
    expect(screen.queryByText("Segunda nota general")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText("Segunda nota general")).toBeInTheDocument();
    expect(screen.queryByText("Primera nota general")).not.toBeInTheDocument();
  });

  it("anotar desde el panel de fuentes salta a las notas del mensaje con la cita cargada", () => {
    render(<DetalleChat id="c1" />);

    fireEvent.click(screen.getByRole("button", { name: /1 consulta · 1 fragmento/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre esta búsqueda/ }));

    expect(screen.getByRole("tab", { name: "Notas del mensaje (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Texto de la nota")).toBeInTheDocument();
    expect(screen.getByText(citaDeBusqueda(busquedaConFuente))).toBeInTheDocument();
  });

  // Las trazas técnicas siguen existiendo, pero solo dentro del bloque
  // «Detalle técnico»: la timeline es la conversación y nada más.
  it("la timeline no rinde trazas técnicas: ni 'turno de', ni la línea de tokens", () => {
    render(<DetalleChat id="c1" />);

    const timeline = within(screen.getByRole("list"));
    expect(timeline.queryByText(/turno de/)).not.toBeInTheDocument();
    expect(timeline.queryByText(/entrada \/ 500 salida/)).not.toBeInTheDocument();
    expect(timeline.queryByText("registrar-caso")).not.toBeInTheDocument();
  });

  it("el bloque «Detalle técnico» resume agentes, modelos, tokens, costo y otras herramientas", () => {
    render(<DetalleChat id="c1" />);

    const detalle = screen.getByText("Detalle técnico").closest("details");
    expect(detalle).not.toBeNull();
    const dentro = within(detalle as HTMLElement);

    expect(dentro.getByText("laboral")).toBeInTheDocument();
    expect(dentro.getByText("openai/gpt-5.6-luna")).toBeInTheDocument();
    expect(dentro.getByText("1000 entrada / 500 salida")).toBeInTheDocument();
    expect(dentro.getByText("US$ 0.0008")).toBeInTheDocument();
    expect(dentro.getByText("registrar-caso")).toBeInTheDocument();
  });

  // Sin el mapa de consultas, una búsqueda sin mensaje asociado no se ve en
  // ninguna solapa: el detalle técnico es lo que evita que desaparezca en
  // silencio (una consulta huérfana es señal de un problema de atribución).
  it("las búsquedas huérfanas quedan contadas en el detalle técnico", () => {
    mockDatos({ ...detalleBase, busquedas: [{ ...busquedaConFuente, messageId: null }] });
    render(<DetalleChat id="c1" />);

    const detalle = screen.getByText("Detalle técnico").closest("details");
    expect(within(detalle as HTMLElement).getByText("Consultas sin respuesta")).toBeInTheDocument();
  });
});
