import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/casos/caso-detalle", () => ({ obtenerCaso: vi.fn() }));

import { auth } from "@/auth";
import { obtenerCaso } from "@/lib/casos/caso-detalle";

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "caso-1" }) };

describe("GET /api/board/casos/[id]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("401 sin sesión, sin tocar la base", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await GET(new Request("http://test/api/board/casos/caso-1"), params);

    expect(response.status).toBe(401);
    expect(obtenerCaso).not.toHaveBeenCalled();
  });

  it("devuelve el detalle del caso", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(obtenerCaso).mockResolvedValue({ id: "caso-1" } as never);

    const response = await GET(new Request("http://test/api/board/casos/caso-1"), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "caso-1" });
  });

  it("404 para un caso inexistente", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(obtenerCaso).mockResolvedValue(null);

    expect((await GET(new Request("http://test/api/board/casos/caso-x"), params)).status).toBe(404);
  });

  it("500 genérico sin filtrar el detalle del error", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(obtenerCaso).mockRejectedValue(new Error("connection refused a postgres://usuario:clave@host"));

    const response = await GET(new Request("http://test/api/board/casos/caso-1"), params);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("postgres://");
  });
});
