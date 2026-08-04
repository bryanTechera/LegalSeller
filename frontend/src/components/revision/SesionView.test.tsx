import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DetalleSesion } from "@/hooks/useRevisionChat";
import type { BusquedaCorpus } from "@/lib/revision/fuentes";

import { SesionView } from "./SesionView";

// Mismo patrón que DetalleChat.test.tsx (mock de swr): SesionView obtiene su
// detalle de useRevisionChat, así que se mockea el hook y cada test controla
// { detalle, ... } directamente, sin pegarle a la red.
const revisionChatMock = vi.hoisted(() => ({ useRevisionChat: vi.fn() }));
vi.mock("@/hooks/useRevisionChat", () => revisionChatMock);

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

const detalleBase: DetalleSesion = {
  sesion: { id: "s1", titulo: "[escenario] despido", creadaPor: "Asistente técnico" },
  timeline: [
    { tipo: "mensaje", id: "u1", rol: "user", texto: "Me despidieron sin causa", fecha: "2026-08-04T10:00:00.000Z" },
    {
      tipo: "mensaje",
      id: "a1",
      rol: "assistant",
      texto: "Contame un poco más sobre tu antigüedad",
      fecha: "2026-08-04T10:01:00.000Z",
    },
  ],
  busquedas: [busquedaConFuente],
  notas: [],
};

function mockDetalle(detalle: DetalleSesion | null) {
  vi.mocked(revisionChatMock.useRevisionChat).mockReturnValue({
    detalle,
    isStreaming: false,
    pendienteUsuario: null,
    textoStreaming: null,
    error: null,
    sendMessage: vi.fn(),
    refetch: vi.fn(),
  });
}

describe("SesionView", () => {
  beforeEach(() => {
    mockDetalle(detalleBase);
  });

  it("la marca de fuentes aparece bajo la respuesta del agente y no bajo el mensaje del usuario", () => {
    render(<SesionView id="s1" onVolver={() => {}} />);

    const burbujaAsistente = document.querySelector('[data-message-id="a1"]');
    expect(burbujaAsistente).not.toBeNull();
    const bloqueAsistente = burbujaAsistente!.closest("div")!.parentElement as HTMLElement;
    expect(within(bloqueAsistente).getByText("1 consulta · 1 fragmento")).toBeInTheDocument();

    const burbujaUsuario = document.querySelector('[data-message-id="u1"]');
    expect(burbujaUsuario).not.toBeNull();
    const bloqueUsuario = burbujaUsuario!.closest("div")!.parentElement as HTMLElement;
    expect(within(bloqueUsuario).queryByText(/consulta/)).not.toBeInTheDocument();
  });

  it("clic en la marca de fuentes muestra la consulta de esa respuesta en el panel lateral", () => {
    render(<SesionView id="s1" onVolver={() => {}} />);

    // Antes del clic, el panel muestra el mapa de toda la sesión (contador
    // "con fuentes"), no el detalle de una respuesta puntual.
    expect(screen.getByText(/con fuentes/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("1 consulta · 1 fragmento"));

    expect(screen.getByText("Consulta del agente")).toBeInTheDocument();
    expect(screen.getByText("despido sin causa indemnización")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver todas las consultas" })).toBeInTheDocument();
  });

  it("sin búsquedas, no se rinde ninguna marca de fuentes", () => {
    mockDetalle({ ...detalleBase, busquedas: [] });
    render(<SesionView id="s1" onVolver={() => {}} />);

    expect(screen.queryByText(/consulta/)).not.toBeInTheDocument();
    expect(screen.getByText("Este chat no consultó el corpus.")).toBeInTheDocument();
  });
});
