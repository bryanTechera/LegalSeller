import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Metricas } from "@/lib/board/metricas";
import type { UsoModelo } from "@/lib/board/metricas-agente";

import { costoTotal, MetricasPanel } from "./MetricasPanel";

// Mismo patrón que DetalleCaso.test.tsx: se mockea el default export de swr y
// cada test controla { data, error, isLoading, mutate } sin pegarle a la red.
vi.mock("swr", () => ({ default: vi.fn() }));

function modelo(overrides: Partial<UsoModelo>): UsoModelo {
  return { modelo: "gemini-3-flash", tokensEntrada: 0, tokensSalida: 0, costoUsd: 1, ...overrides };
}

const metricasBase: Metricas = {
  rango: "30d",
  funnel: { iniciadas: 10, clasificadas: 8, captadas: 2, fueraDeCobertura: 2 },
  demanda: {
    categorias: [],
    subcategorias: [],
    fueraDeCobertura: [
      { casoId: "caso-2", conversationId: "conv-1", fecha: "2026-08-01T10:00:00.000Z", resumen: "Consulta sobre plataformas" },
    ],
  },
  agente: { modelos: [], tools: [], latencia: { p50Ms: 0, p95Ms: 0 } },
  volumen: { porDia: [], porHora: [], mensajesPorConversacion: 0, tasaAbandono: 0 },
  captados: [
    {
      id: "caso-1",
      conversationId: "conv-1",
      ultimoMensaje: "2026-08-01T10:00:00.000Z",
      contactoNombre: "Ana Pérez",
      contactoTelefono: "099123456",
      contactoEmail: "ana@ejemplo.com",
      situacion: "La despidieron sin causa tras seis años.",
    },
  ],
};

function mockMetricas(datos: Metricas | undefined, error?: Error): void {
  vi.mocked(useSWR).mockReturnValue({
    data: datos,
    error,
    isLoading: datos === undefined && error === undefined,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useSWR>);
}

describe("MetricasPanel", () => {
  beforeEach(() => vi.resetAllMocks());

  it("enlaza cada caso captado a su vista de caso", async () => {
    mockMetricas(metricasBase);
    render(<MetricasPanel />);
    const enlaces = await screen.findAllByRole("link", { name: /ver caso/i });
    expect(enlaces.some((enlace) => enlace.getAttribute("href") === "/board/casos/caso-1")).toBe(true);
  });

  it("muestra el resumen de cada caso captado en el listado", async () => {
    mockMetricas(metricasBase);
    render(<MetricasPanel />);
    expect(await screen.findByText(/La despidieron sin causa/)).toBeInTheDocument();
  });

  it("enlaza cada pedido fuera de cobertura a su caso", async () => {
    mockMetricas(metricasBase);
    render(<MetricasPanel />);
    const enlaces = await screen.findAllByRole("link", { name: /ver caso/i });
    expect(enlaces.some((enlace) => enlace.getAttribute("href") === "/board/casos/caso-2")).toBe(true);
  });
});

describe("costoTotal", () => {
  it("sin modelos en el rango, no hay total", () => {
    expect(costoTotal([])).toBe("—");
  });

  it("todos los modelos conocidos, total exacto sin marca de parcial", () => {
    expect(
      costoTotal([modelo({ modelo: "gemini-3-flash", costoUsd: 1.5 }), modelo({ modelo: "gemini-embedding-001", costoUsd: 0.5 })]),
    ).toBe("USD 2.00");
  });

  it("mezcla de modelos conocidos y desconocidos, total parcial sobre los conocidos", () => {
    expect(
      costoTotal([modelo({ modelo: "gemini-3-flash", costoUsd: 1.5 }), modelo({ modelo: "openai/gpt-9", costoUsd: null })]),
    ).toBe("USD 1.50 (parcial)");
  });

  // El bug real: sum([]) da 0, y "USD 0.00 (parcial)" se lee como gasto real
  // en vez de "no tenemos precio para nada de lo que corrió" — exactamente
  // el escenario que produce un swap de modelo (spec §4.4).
  it("todos los modelos sin precio conocido devuelve sin dato, no USD 0.00", () => {
    expect(costoTotal([modelo({ modelo: "openai/gpt-9", tokensEntrada: 100, tokensSalida: 100, costoUsd: null })])).toBe(
      "sin dato",
    );
  });

  it("varios modelos, todos sin precio conocido, también sin dato", () => {
    expect(
      costoTotal([modelo({ modelo: "openai/gpt-9", costoUsd: null }), modelo({ modelo: "anthropic/claude-x", costoUsd: null })]),
    ).toBe("sin dato");
  });
});
