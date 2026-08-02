import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const conversacionesMock = vi.hoisted(() => ({ obtenerConversacion: vi.fn() }));
vi.mock("@/lib/board/conversaciones", () => conversacionesMock);

const notasMock = vi.hoisted(() => ({ crearNota: vi.fn() }));
vi.mock("@/lib/revision/notas", () => notasMock);

import { POST } from "./route";

function pedido(body: unknown): Request {
  return new Request("http://localhost/api/board/conversaciones/c1/notas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "c1" });

describe("POST /api/board/conversaciones/[id]/notas", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.auth.mockResolvedValue({ user: { name: "Dra. García", email: "garcia@jurco.uy" } });
    conversacionesMock.obtenerConversacion.mockResolvedValue({ id: "c1" });
    notasMock.crearNota.mockResolvedValue({ id: "n1" });
  });

  it("sin sesión responde 401 sin escribir nada", async () => {
    authMock.auth.mockResolvedValue(null);
    const response = await POST(pedido({ texto: "Nota" }), { params });
    expect(response.status).toBe(401);
    expect(notasMock.crearNota).not.toHaveBeenCalled();
  });

  // El browser es el lado experto: la nota nace ABIERTA y feedback:pull la
  // levanta. Con origen DEV nacería RESPONDIDA y el loop quedaría cortado.
  it("crea la nota con origen EXPERTO y alcance chat-real", async () => {
    const response = await POST(pedido({ texto: "Afirmó un plazo sin buscar" }), { params });
    expect(response.status).toBe(201);
    expect(notasMock.crearNota).toHaveBeenCalledWith(
      expect.objectContaining({ origen: "EXPERTO", alcance: "chat-real", autor: "Dra. García" }),
    );
  });

  it("el autor sale de la sesión, no del body", async () => {
    await POST(pedido({ texto: "Nota", autor: "impostor@example.com" }), { params });
    expect(notasMock.crearNota).toHaveBeenCalledWith(
      expect.objectContaining({ autor: "Dra. García" }),
    );
  });

  it("conversación inexistente o de revisión responde 404", async () => {
    conversacionesMock.obtenerConversacion.mockResolvedValue(null);
    const response = await POST(pedido({ texto: "Nota" }), { params });
    expect(response.status).toBe(404);
    expect(notasMock.crearNota).not.toHaveBeenCalled();
  });

  it("texto vacío responde 400", async () => {
    const response = await POST(pedido({ texto: "  " }), { params });
    expect(response.status).toBe(400);
    expect(notasMock.crearNota).not.toHaveBeenCalled();
  });
});
