import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CasoResumen, PaginaCasos } from "@/lib/board/casos";

import { ListadoCasos } from "./ListadoCasos";

// Mismo patrón que ListadoChats.test.tsx: se mockea el default export de swr
// y cada test controla { data, error, isLoading }.
vi.mock("swr", () => ({ default: vi.fn() }));

const casoBase: CasoResumen = {
  id: "caso-1",
  conversationId: "conv-1",
  fecha: "2026-08-01T10:00:00.000Z",
  ultimaActividad: "2026-08-09T14:00:00.000Z",
  gestion: "NUEVO",
  estado: "CAPTADO",
  categoria: "laboral",
  subcategorias: ["despido"],
  contactoNombre: "Ana Pérez",
  contactoTelefono: "099111222",
  contactoEmail: "ana@example.com",
  situacion: "La despidieron sin causa.",
};

function mockPagina(casos: CasoResumen[], cursor: string | null = null): void {
  const pagina: PaginaCasos = { casos, cursor };
  vi.mocked(useSWR).mockReturnValue({
    data: pagina,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useSWR>);
}

describe("ListadoCasos", () => {
  beforeEach(() => vi.resetAllMocks());

  it("muestra el caso con su gestión, contacto y situación", () => {
    mockPagina([casoBase]);
    render(<ListadoCasos />);

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("nuevo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /La despidieron sin causa/ })).toHaveAttribute(
      "href",
      "/board/casos/caso-1",
    );
  });

  // Abre por los leads accionables: el resto se pide con el filtro.
  it("arranca filtrado en captados", () => {
    mockPagina([casoBase]);
    render(<ListadoCasos />);

    expect(vi.mocked(useSWR).mock.calls[0]?.[0]).toContain("estado=CAPTADO");
  });

  it("un caso sin contacto ni síntesis se muestra igual", () => {
    mockPagina([
      {
        ...casoBase,
        estado: "EN_CONVERSACION",
        contactoNombre: null,
        contactoTelefono: null,
        contactoEmail: null,
        situacion: null,
      },
    ]);
    render(<ListadoCasos />);

    expect(screen.getByRole("link", { name: "Ver el caso" })).toBeInTheDocument();
  });

  it("sin casos avisa en vez de mostrar una tabla vacía", () => {
    mockPagina([]);
    render(<ListadoCasos />);

    expect(screen.getByText("No hay casos con estos filtros.")).toBeInTheDocument();
  });

  it("ofrece cargar más cuando hay cursor", () => {
    mockPagina([casoBase], "caso-1");
    render(<ListadoCasos />);

    expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
  });

  it("un error de carga se avisa", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("falló"),
      isLoading: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSWR>);
    render(<ListadoCasos />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los casos.");
  });
});
