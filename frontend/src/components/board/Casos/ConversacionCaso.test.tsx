import { render, screen, waitFor, within } from "@testing-library/react";
import useSWR from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DetalleConversacion } from "@/lib/board/conversaciones";

import { ConversacionCaso } from "./ConversacionCaso";

vi.mock("swr", () => ({ default: vi.fn() }));

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
    {
      tipo: "turno-agente",
      spanId: "s1",
      agente: "laboral",
      fecha: "2026-08-08T10:00:01.000Z",
    },
    {
      tipo: "mensaje",
      id: "m2",
      rol: "assistant",
      texto: "Con esa antigüedad te corresponde la **indemnización por despido**.",
      fecha: "2026-08-08T10:00:05.000Z",
    },
  ],
  busquedas: [],
  casos: [],
  notas: [],
  intentosExtraccion: 0,
  reglasExtraccion: [],
};

function mockConversacion(datos: DetalleConversacion | undefined, error?: Error) {
  vi.mocked(useSWR).mockReturnValue({
    data: datos,
    error,
    isLoading: datos === undefined && error === undefined,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useSWR>);
}

describe("ConversacionCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("muestra los mensajes de la conversación con el rol de cada uno", () => {
    mockConversacion(conversacionBase);
    render(<ConversacionCaso conversationId="conv-1" />);

    expect(screen.getByText(/me despidieron sin causa/)).toBeInTheDocument();
    // El agente responde en markdown: sin rendirlo el equipo lee los asteriscos.
    expect(screen.getByText("indemnización por despido")).toBeInTheDocument();
  });

  // Lo que no es mensaje (turnos de agente, tool calls, generaciones) es
  // diagnóstico técnico y se lee en el tab Chats: acá estorba.
  it("deja fuera los items técnicos de la timeline", () => {
    mockConversacion(conversacionBase);
    render(<ConversacionCaso conversationId="conv-1" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("avisa cuando la conversación no tiene mensajes guardados", () => {
    mockConversacion({ ...conversacionBase, timeline: [] });
    render(<ConversacionCaso conversationId="conv-1" />);

    expect(screen.getByText(/no tiene mensajes guardados/i)).toBeInTheDocument();
  });

  // Una conversación puede haber producido más de un caso: sin el aviso, quien
  // lee la ficha cree que todo lo que ve es de ESTE caso.
  it("avisa cuando la conversación produjo más de un caso", () => {
    mockConversacion({
      ...conversacionBase,
      casos: [
        {
          id: "caso-1",
          estado: "CAPTADO",
          categoria: "laboral",
          subcategorias: ["despido"],
          contactoNombre: null,
          contactoTelefono: null,
          contactoEmail: null,
          esActivo: false,
          resumen: null,
          correccionAplicada: false,
          eventos: [],
        },
        {
          id: "caso-2",
          estado: "EN_CONVERSACION",
          categoria: "arrendamiento-desalojo",
          subcategorias: [],
          contactoNombre: null,
          contactoTelefono: null,
          contactoEmail: null,
          esActivo: true,
          resumen: null,
          correccionAplicada: false,
          eventos: [],
        },
      ],
    });
    render(<ConversacionCaso conversationId="conv-1" />);

    expect(screen.getByText(/2 casos/i)).toBeInTheDocument();
  });

  it("muestra el aviso del filtro de confidencialidad cuando hubo intentos", () => {
    mockConversacion({
      ...conversacionBase,
      intentosExtraccion: 2,
      reglasExtraccion: ["modelo", "arquitectura"],
    });
    render(<ConversacionCaso conversationId="conv-1" />);

    const aviso = within(screen.getByRole("status"));
    expect(aviso.getByText(/2/)).toBeInTheDocument();
  });

  it("muestra un error si la conversación no carga", async () => {
    mockConversacion(undefined, new Error("caída"));
    render(<ConversacionCaso conversationId="conv-1" />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
