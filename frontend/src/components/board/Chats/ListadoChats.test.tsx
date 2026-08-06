import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatResumen, PaginaChats } from "@/lib/board/conversaciones";

import { ListadoChats } from "./ListadoChats";

// Mismo patrón que DetalleChat.test.tsx: se mockea el default export de swr y
// cada test controla { data, error, isLoading } sin pegarle a la red.
vi.mock("swr", () => ({ default: vi.fn() }));

const chatBase: ChatResumen = {
  id: "c1",
  fecha: "2026-08-04T10:00:00.000Z",
  ultimaActividad: "2026-08-04T10:05:00.000Z",
  categoria: "laboral",
  estadoCaso: "CAPTADO",
  casos: 1,
  mensajes: 6,
  preview: "Me despidieron sin causa",
  notas: 0,
  intentosExtraccion: 0,
  reglasExtraccion: [],
};

function mockPagina(chats: ChatResumen[]): void {
  const pagina: PaginaChats = { chats, cursor: null };
  vi.mocked(useSWR).mockReturnValue({
    data: pagina,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useSWR>);
}

describe("ListadoChats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("marca la conversación con intentos de extracción", () => {
    // El preview del listado es el primer mensaje del usuario: un red-team que
    // arranca con una consulta legítima y recién después pivotea no se
    // distingue de una conversación normal sin este badge.
    mockPagina([{ ...chatBase, intentosExtraccion: 2, reglasExtraccion: ["proveedor", "infra"] }]);
    render(<ListadoChats />);

    const badge = screen.getByText("Intento de extracción (2)");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Reglas: proveedor, infra");
  });

  it("una conversación normal no lleva el badge", () => {
    mockPagina([chatBase]);
    render(<ListadoChats />);

    expect(screen.queryByText(/Intento de extracción/)).not.toBeInTheDocument();
  });
});
