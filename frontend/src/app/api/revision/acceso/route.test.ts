import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieMock = vi.hoisted(() => ({
  getRevisionClave: vi.fn<() => string | null>(),
  setExpertoCookie: vi.fn(),
}));
vi.mock("@/lib/revision/experto-cookie", () => cookieMock);

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/revision/acceso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/revision/acceso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clave no configurada → 503 (feature apagada)", async () => {
    cookieMock.getRevisionClave.mockReturnValue(null);
    const response = await POST(request({ clave: "x", nombre: "Dra. García" }));
    expect(response.status).toBe(503);
  });

  it("clave incorrecta → 401 y no setea cookie", async () => {
    cookieMock.getRevisionClave.mockReturnValue("la-clave");
    const response = await POST(request({ clave: "otra", nombre: "Dra. García" }));
    expect(response.status).toBe(401);
    expect(cookieMock.setExpertoCookie).not.toHaveBeenCalled();
  });

  it("clave correcta → 200, setea cookie con el nombre", async () => {
    cookieMock.getRevisionClave.mockReturnValue("la-clave");
    const response = await POST(request({ clave: "la-clave", nombre: "Dra. García" }));
    expect(response.status).toBe(200);
    expect(cookieMock.setExpertoCookie).toHaveBeenCalledWith("Dra. García", "la-clave");
  });

  it("body inválido → 400", async () => {
    cookieMock.getRevisionClave.mockReturnValue("la-clave");
    const response = await POST(request({ clave: "la-clave", nombre: "x" }));
    expect(response.status).toBe(400);
  });
});
