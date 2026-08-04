import { beforeEach, describe, expect, it, vi } from "vitest";

const identidadMock = vi.hoisted(() => ({ getIdentidadBoard: vi.fn() }));
vi.mock("@/lib/board/identidad", () => identidadMock);

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

const busquedasMock = vi.hoisted(() => ({ construirBusquedas: vi.fn() }));
vi.mock("@/lib/revision/busquedas", () => busquedasMock);

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
    identidadMock.getIdentidadBoard.mockResolvedValue({ nombre: "Dra. García", tipo: "humano" });
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
    busquedasMock.construirBusquedas.mockResolvedValue([]);
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

  it("devuelve las búsquedas al corpus de la sesión", async () => {
    busquedasMock.construirBusquedas.mockResolvedValue([
      { spanId: "t1", messageId: "m1", agente: "laboral", consulta: "despido", categoria: "laboral", subcategorias: [], estado: "ok", fragmentos: [], fecha: "2026-08-04T10:00:00.000Z" },
    ]);
    const response = await GET(new Request("http://localhost/api/revision/sesiones/s1"), { params: Promise.resolve({ id: "s1" }) });
    const cuerpo = (await response.json()) as { busquedas: unknown[] };
    expect(cuerpo.busquedas).toHaveLength(1);
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
    identidadMock.getIdentidadBoard.mockResolvedValue(null);
    const response = await PATCH(patchRequest({ borrador: false }), params);
    expect(response.status).toBe(401);
  });
});
