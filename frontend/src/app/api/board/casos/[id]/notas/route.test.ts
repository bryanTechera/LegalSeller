import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/casos/notas-caso", () => ({ crearNotaCaso: vi.fn() }));

import { auth } from "@/auth";
import { crearNotaCaso } from "@/lib/casos/notas-caso";

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "caso-1" }) };

function pedido(body: unknown): Request {
  return new Request("http://test/api/board/casos/caso-1/notas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/board/casos/[id]/notas", () => {
  beforeEach(() => vi.resetAllMocks());

  it("401 sin sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    expect((await POST(pedido({ texto: "algo" }), params)).status).toBe(401);
    expect(crearNotaCaso).not.toHaveBeenCalled();
  });

  // El autor es identidad, no dato de entrada: aceptarlo del body dejaría que
  // cualquiera firme una nota con el nombre de otro.
  it("el autor sale de la sesión y no del body", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(crearNotaCaso).mockResolvedValue({ id: "nota-1", autor: "ana@estudio.uy", texto: "algo", createdAt: "2026-08-08T12:00:00.000Z" });

    const response = await POST(pedido({ texto: "algo", autor: "otro@estudio.uy" }), params);

    expect(response.status).toBe(201);
    expect(vi.mocked(crearNotaCaso).mock.calls[0]?.[0].autor).toBe("ana@estudio.uy");
  });

  it("400 con texto vacío", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);

    expect((await POST(pedido({ texto: "" }), params)).status).toBe(400);
    expect(crearNotaCaso).not.toHaveBeenCalled();
  });

  it("404 cuando el caso no existe o es de revisión", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(crearNotaCaso).mockResolvedValue(null);

    expect((await POST(pedido({ texto: "algo" }), params)).status).toBe(404);
  });
});
