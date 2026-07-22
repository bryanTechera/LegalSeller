import { beforeEach, describe, expect, it, vi } from "vitest";

const expertoMock = vi.hoisted(() => ({ getExperto: vi.fn() }));
vi.mock("@/lib/revision/experto-cookie", () => expertoMock);

const sesionesMock = vi.hoisted(() => ({
  crearSesionRevision: vi.fn(),
  listarSesionesRevision: vi.fn(),
}));
vi.mock("@/lib/revision/sesiones", () => sesionesMock);

import { GET, POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/revision/sesiones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/revision/sesiones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expertoMock.getExperto.mockResolvedValue({ nombre: "Dra. García" });
    sesionesMock.listarSesionesRevision.mockResolvedValue([]);
    sesionesMock.crearSesionRevision.mockResolvedValue({ id: "s1", threadId: "t1" });
  });

  it("GET sin auth → 401", async () => {
    expertoMock.getExperto.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/revision/sesiones"));
    expect(response.status).toBe(401);
  });

  it("GET default excluye borradores", async () => {
    await GET(new Request("http://localhost/api/revision/sesiones"));
    expect(sesionesMock.listarSesionesRevision).toHaveBeenCalledWith({ incluirBorradores: false });
  });

  it("GET ?borradores=1 los incluye", async () => {
    await GET(new Request("http://localhost/api/revision/sesiones?borradores=1"));
    expect(sesionesMock.listarSesionesRevision).toHaveBeenCalledWith({ incluirBorradores: true });
  });

  it("POST con origen autonoma lo pasa a la creación", async () => {
    const response = await POST(postRequest({ titulo: "[escenario] x", origen: "autonoma" }));
    expect(response.status).toBe(201);
    expect(sesionesMock.crearSesionRevision).toHaveBeenCalledWith({
      titulo: "[escenario] x",
      creadaPor: "Dra. García",
      origen: "autonoma",
    });
  });

  it("POST sin origen crea sesión de experto (origen undefined)", async () => {
    await POST(postRequest({ titulo: "Sesión" }));
    expect(sesionesMock.crearSesionRevision).toHaveBeenCalledWith({
      titulo: "Sesión",
      creadaPor: "Dra. García",
      origen: undefined,
    });
  });

  it("POST con origen inválido → 400", async () => {
    const response = await POST(postRequest({ origen: "humano" }));
    expect(response.status).toBe(400);
  });
});
