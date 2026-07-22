import { beforeEach, describe, expect, it, vi } from "vitest";

const expertoMock = vi.hoisted(() => ({ getExperto: vi.fn() }));
vi.mock("@/lib/revision/experto-cookie", () => expertoMock);

const sesionesMock = vi.hoisted(() => ({
  getSesionRevision: vi.fn(),
  publicarSesionRevision: vi.fn(),
  getCasoDeSesion: vi.fn(),
}));
vi.mock("@/lib/revision/sesiones", () => sesionesMock);

const notasMock = vi.hoisted(() => ({ listarNotasDeSesion: vi.fn() }));
vi.mock("@/lib/revision/notas", () => notasMock);

const timelineMock = vi.hoisted(() => ({ construirTimeline: vi.fn() }));
vi.mock("@/lib/revision/timeline", () => timelineMock);

import { GET, PATCH } from "./route";

const params = { params: Promise.resolve({ id: "s1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/revision/sesiones/s1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/revision/sesiones/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expertoMock.getExperto.mockResolvedValue({ nombre: "Dra. García" });
    sesionesMock.getSesionRevision.mockResolvedValue({
      id: "s1",
      sessionId: "ss1",
      threadId: "t1",
      titulo: "[escenario] divorcio",
      creadaPor: "Asistente técnico",
      origenRevision: "AUTONOMA",
      borrador: true,
    });
    sesionesMock.getCasoDeSesion.mockResolvedValue({ estado: "CAPTADO" });
    sesionesMock.publicarSesionRevision.mockResolvedValue(true);
    notasMock.listarNotasDeSesion.mockResolvedValue([]);
    timelineMock.construirTimeline.mockResolvedValue([]);
  });

  it("GET incluye caso y campos de origen de la sesión", async () => {
    const response = await GET(new Request("http://localhost/api/revision/sesiones/s1"), params);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      sesion: { origenRevision: string; borrador: boolean };
      caso: { estado: string } | null;
    };
    expect(payload.sesion.origenRevision).toBe("AUTONOMA");
    expect(payload.sesion.borrador).toBe(true);
    expect(payload.caso).toEqual({ estado: "CAPTADO" });
    expect(sesionesMock.getCasoDeSesion).toHaveBeenCalledWith("s1");
  });

  it("PATCH publica la sesión", async () => {
    const response = await PATCH(patchRequest({ borrador: false }), params);
    expect(response.status).toBe(200);
    expect(sesionesMock.publicarSesionRevision).toHaveBeenCalledWith("s1");
  });

  it("PATCH sobre sesión inexistente o ya publicada → 404", async () => {
    sesionesMock.publicarSesionRevision.mockResolvedValue(false);
    const response = await PATCH(patchRequest({ borrador: false }), params);
    expect(response.status).toBe(404);
  });

  it("PATCH con body inválido → 400", async () => {
    const response = await PATCH(patchRequest({ borrador: true }), params);
    expect(response.status).toBe(400);
  });

  it("PATCH sin auth → 401", async () => {
    expertoMock.getExperto.mockResolvedValue(null);
    const response = await PATCH(patchRequest({ borrador: false }), params);
    expect(response.status).toBe(401);
  });
});
