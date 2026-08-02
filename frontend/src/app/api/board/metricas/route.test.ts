import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const metricasMock = vi.hoisted(() => ({ calcularMetricas: vi.fn() }));
vi.mock("@/lib/board/metricas", () => metricasMock);

import { GET } from "./route";

function pedido(query: string): Request {
  return new Request(`http://localhost/api/board/metricas${query}`);
}

describe("GET /api/board/metricas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.auth.mockResolvedValue({ user: { email: "ana@jurco.uy" } });
    metricasMock.calcularMetricas.mockResolvedValue({ rango: "7d" });
  });

  // Defensa en profundidad: el proxy ya filtró, pero el handler no confía en él.
  it("sin sesión responde 401 sin consultar la base", async () => {
    authMock.auth.mockResolvedValue(null);
    const response = await GET(pedido("?rango=7d"));
    expect(response.status).toBe(401);
    expect(metricasMock.calcularMetricas).not.toHaveBeenCalled();
  });

  it("pasa el rango recibido", async () => {
    await GET(pedido("?rango=90d"));
    expect(metricasMock.calcularMetricas).toHaveBeenCalledWith("90d");
  });

  it("sin rango usa 30d por defecto", async () => {
    await GET(pedido(""));
    expect(metricasMock.calcularMetricas).toHaveBeenCalledWith("30d");
  });

  it("rango inválido responde 400", async () => {
    const response = await GET(pedido("?rango=1d"));
    expect(response.status).toBe(400);
    expect(metricasMock.calcularMetricas).not.toHaveBeenCalled();
  });

  it("un error de la capa de datos responde 500 sin filtrar el detalle", async () => {
    metricasMock.calcularMetricas.mockRejectedValue(new Error("column x does not exist"));
    const response = await GET(pedido("?rango=7d"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("column x");
  });
});
