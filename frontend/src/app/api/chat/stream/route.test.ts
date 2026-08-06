import { beforeEach, describe, expect, it, vi } from "vitest";

const orchestratorMock = vi.hoisted(() => ({ orchestrateChatTurn: vi.fn() }));
vi.mock("@/lib/chat-orchestrator", () => orchestratorMock);

const sessionMock = vi.hoisted(() => ({ getOrCreateSessionId: vi.fn() }));
vi.mock("@/lib/session", () => sessionMock);

import { POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/chat/stream", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionMock.getOrCreateSessionId.mockResolvedValue("s1");
    orchestratorMock.orchestrateChatTurn.mockResolvedValue(new Response("data: {}\n\n"));
  });

  it("el handler público no puede activar eventosCompletos desde el body", async () => {
    // eventosCompletos es lo que le devolvería al browser los tool-call con su
    // toolName y sus args. El handler nunca lo reenvía: la garantía es del call
    // site, no del schema, así que se asierta sobre lo que efectivamente se pasa.
    await POST(postRequest({ message: "hola", eventosCompletos: true }));

    expect(orchestratorMock.orchestrateChatTurn).toHaveBeenCalledTimes(1);
    const args = orchestratorMock.orchestrateChatTurn.mock.calls[0][0] as Record<string, unknown>;
    expect(args.eventosCompletos).toBeUndefined();
    expect(args).toEqual({ sessionId: "s1", message: "hola" });
  });
});
