import { beforeEach, describe, expect, it, vi } from "vitest";

const visitasMock = vi.hoisted(() => ({ registrarVisita: vi.fn() }));
vi.mock("@/lib/visitas", () => visitasMock);

const sessionMock = vi.hoisted(() => ({ getOrCreateSessionId: vi.fn() }));
vi.mock("@/lib/session", () => sessionMock);

import { POST } from "./route";

function postRequest(body: unknown, userAgent = "Mozilla/5.0 Chrome/153"): Request {
  return new Request("https://dudaya.com/api/visita", {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": userAgent, "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

describe("/api/visita", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionMock.getOrCreateSessionId.mockResolvedValue("s1");
    visitasMock.registrarVisita.mockResolvedValue("registrada");
  });

  it("registra la visita con la sesión de la cookie, el user agent y el host", async () => {
    const response = await POST(postRequest({ utmSource: "instagram", referrer: "https://l.instagram.com/" }));

    expect(response.status).toBe(204);
    expect(visitasMock.registrarVisita).toHaveBeenCalledWith({
      sessionId: "s1",
      userAgent: "Mozilla/5.0 Chrome/153",
      host: "dudaya.com",
      utmSource: "instagram",
      referrer: "https://l.instagram.com/",
    });
  });

  // La medición nunca le rompe nada al consultante: un error de base se
  // loguea y el beacon igual responde 204.
  it("un error al registrar no se propaga", async () => {
    visitasMock.registrarVisita.mockRejectedValue(new Error("db caída"));
    const response = await POST(postRequest({}));
    expect(response.status).toBe(204);
  });

  it("rechaza un body con campos fuera de rango", async () => {
    const response = await POST(postRequest({ utmSource: "x".repeat(500) }));
    expect(response.status).toBe(400);
    expect(visitasMock.registrarVisita).not.toHaveBeenCalled();
  });
});
