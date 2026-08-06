import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestratorMock = vi.hoisted(() => ({ orchestrateChatTurn: vi.fn() }));
vi.mock("@/lib/chat-orchestrator", () => orchestratorMock);

const identidadMock = vi.hoisted(() => ({ getIdentidadBoard: vi.fn() }));
vi.mock("@/lib/board/identidad", () => identidadMock);

const sesionesMock = vi.hoisted(() => ({ getSesionRevision: vi.fn() }));
vi.mock("@/lib/revision/sesiones", () => sesionesMock);

const rateLimitMock = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => rateLimitMock);

import { POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/revision/sesiones/s1/mensajes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "s1" });

describe("/api/revision/sesiones/[id]/mensajes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    identidadMock.getIdentidadBoard.mockResolvedValue({ nombre: "Dra. García", tipo: "humano" });
    sesionesMock.getSesionRevision.mockResolvedValue({ id: "s1", sessionId: "sess-1" });
    rateLimitMock.checkRateLimit.mockReturnValue({ allowed: true });
    orchestratorMock.orchestrateChatTurn.mockResolvedValue(new Response("data: {}\n\n"));
  });

  it("pide los eventos completos: el runner de escenarios lee los tool-call de este stream", async () => {
    await POST(postRequest({ message: "hola" }), { params });

    expect(orchestratorMock.orchestrateChatTurn).toHaveBeenCalledTimes(1);
    const args = orchestratorMock.orchestrateChatTurn.mock.calls[0][0] as Record<string, unknown>;
    expect(args.eventosCompletos).toBe(true);
  });

  it("sin auth no llega a orquestar nada", async () => {
    identidadMock.getIdentidadBoard.mockResolvedValue(null);
    await POST(postRequest({ message: "hola" }), { params });
    expect(orchestratorMock.orchestrateChatTurn).not.toHaveBeenCalled();
  });
});
