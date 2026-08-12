import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const casosMock = vi.hoisted(() => ({ listarCasos: vi.fn() }));
vi.mock("@/lib/board/casos", () => casosMock);

import { GET } from "./route";

function pedido(query: string): Request {
  return new Request(`http://localhost/api/board/casos${query}`);
}

describe("GET /api/board/casos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.auth.mockResolvedValue({ user: { email: "ana@estudio.uy" } });
    casosMock.listarCasos.mockResolvedValue({ casos: [], cursor: null });
  });

  it("sin sesión responde 401 sin consultar la base", async () => {
    authMock.auth.mockResolvedValue(null);
    const response = await GET(pedido("?rango=7d"));

    expect(response.status).toBe(401);
    expect(casosMock.listarCasos).not.toHaveBeenCalled();
  });

  it("pasa los filtros recibidos", async () => {
    await GET(pedido("?rango=90d&gestion=DERIVADO&estado=CAPTADO&categoria=laboral&contacto=ana"));

    expect(casosMock.listarCasos).toHaveBeenCalledWith({
      rango: "90d",
      gestion: "DERIVADO",
      estado: "CAPTADO",
      categoria: "laboral",
      contacto: "ana",
    });
  });

  it("sin rango usa 30d por defecto", async () => {
    await GET(pedido(""));

    expect(casosMock.listarCasos).toHaveBeenCalledWith({ rango: "30d" });
  });

  it("una gestión fuera del enum responde 400", async () => {
    const response = await GET(pedido("?gestion=ARCHIVADO"));

    expect(response.status).toBe(400);
    expect(casosMock.listarCasos).not.toHaveBeenCalled();
  });

  it("un error de la capa de datos responde 500 sin filtrar el detalle", async () => {
    casosMock.listarCasos.mockRejectedValue(new Error("column gestion does not exist"));
    const response = await GET(pedido("?rango=7d"));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("column gestion");
  });
});
