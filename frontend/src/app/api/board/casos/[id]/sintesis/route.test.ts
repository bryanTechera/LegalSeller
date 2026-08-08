import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/casos/sintesis", () => ({ asegurarSintesis: vi.fn() }));

import { auth } from "@/auth";
import { asegurarSintesis } from "@/lib/casos/sintesis";

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "caso-1" }) };

describe("POST /api/board/casos/[id]/sintesis", () => {
  beforeEach(() => vi.resetAllMocks());

  // Cada hit exitoso factura (forzar: true ignora la huella y llama al
  // modelo): el 401 tiene que cortar ANTES de tocar asegurarSintesis.
  it("401 sin sesión, y asegurarSintesis no fue llamada", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await POST(new Request("http://test/api/board/casos/caso-1/sintesis", { method: "POST" }), params);

    expect(response.status).toBe(401);
    expect(asegurarSintesis).not.toHaveBeenCalled();
  });

  it("devuelve 200 con la síntesis y fuerza la regeneración", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({
      estado: "ok",
      sintesis: { resumen: "algo" } as never,
      generadaEn: "2026-08-08T12:00:00.000Z",
      vigente: true,
    });

    const response = await POST(new Request("http://test/api/board/casos/caso-1/sintesis", { method: "POST" }), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sintesis: { estado: "ok" } });
    expect(asegurarSintesis).toHaveBeenCalledWith("caso-1", { forzar: true });
  });

  it("404 cuando asegurarSintesis devuelve sin-sintesis", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "sin-sintesis" });

    const response = await POST(new Request("http://test/api/board/casos/caso-1/sintesis", { method: "POST" }), params);

    expect(response.status).toBe(404);
  });

  it("500 genérico sin filtrar el detalle del error", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(asegurarSintesis).mockRejectedValue(new Error("connection refused a postgres://usuario:clave@host"));

    const response = await POST(new Request("http://test/api/board/casos/caso-1/sintesis", { method: "POST" }), params);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("postgres://");
  });
});
