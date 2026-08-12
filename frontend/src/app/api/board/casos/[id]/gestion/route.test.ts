import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const gestionMock = vi.hoisted(() => ({ actualizarGestion: vi.fn() }));
vi.mock("@/lib/casos/gestion", () => gestionMock);

import { PATCH } from "./route";

const GESTION = {
  estado: "CONTACTADO",
  nota: null,
  por: "ana@estudio.uy",
  en: "2026-08-11T12:00:00.000Z",
  historial: [],
};

function pedido(body: unknown): Request {
  return new Request("http://localhost/api/board/casos/caso-1/gestion", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const contexto = { params: Promise.resolve({ id: "caso-1" }) };

describe("PATCH /api/board/casos/[id]/gestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.auth.mockResolvedValue({ user: { email: "ana@estudio.uy" } });
    gestionMock.actualizarGestion.mockResolvedValue(GESTION);
  });

  it("guarda el cambio y devuelve la gestión vigente", async () => {
    const response = await PATCH(pedido({ gestion: "CONTACTADO" }), contexto);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gestion: GESTION });
    expect(gestionMock.actualizarGestion).toHaveBeenCalledWith({
      casoId: "caso-1",
      gestion: "CONTACTADO",
      nota: undefined,
      por: "ana@estudio.uy",
    });
  });

  // Defensa en profundidad: el proxy ya filtró, pero el handler no confía en él.
  it("sin sesión responde 401 sin tocar la base", async () => {
    authMock.auth.mockResolvedValue(null);
    const response = await PATCH(pedido({ gestion: "CONTACTADO" }), contexto);

    expect(response.status).toBe(401);
    expect(gestionMock.actualizarGestion).not.toHaveBeenCalled();
  });

  // El autor es identidad de sesión: aceptarlo del body dejaría firmar
  // cambios con el nombre de otra persona.
  it("ignora un autor mandado en el body", async () => {
    await PATCH(pedido({ gestion: "DERIVADO", por: "otro@estudio.uy" }), contexto);

    expect(gestionMock.actualizarGestion).toHaveBeenCalledWith(
      expect.objectContaining({ por: "ana@estudio.uy" }),
    );
  });

  it("una gestión fuera del enum responde 400", async () => {
    const response = await PATCH(pedido({ gestion: "ARCHIVADO" }), contexto);

    expect(response.status).toBe(400);
    expect(gestionMock.actualizarGestion).not.toHaveBeenCalled();
  });

  it("un caso inexistente o de revisión responde 404", async () => {
    gestionMock.actualizarGestion.mockResolvedValue(null);
    const response = await PATCH(pedido({ gestion: "DERIVADO" }), contexto);

    expect(response.status).toBe(404);
  });

  it("un error de la capa de datos responde 500 sin filtrar el detalle", async () => {
    gestionMock.actualizarGestion.mockRejectedValue(new Error("column gestion does not exist"));
    const response = await PATCH(pedido({ gestion: "DERIVADO" }), contexto);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("column gestion");
  });
});
