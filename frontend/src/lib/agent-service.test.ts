import { afterEach, describe, expect, it, vi } from "vitest";

import { appendThreadMessages, streamAgentMessage } from "./agent-service";

describe("agent-service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("memoryReadOnly agrega la opción de memoria de solo lectura", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    await streamAgentMessage({
      agentId: "recepcion",
      threadId: "chat-s1",
      userId: "s1",
      message: "hola",
      memoryReadOnly: true,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.memory).toEqual({ thread: "chat-s1", resource: "s1", options: { readOnly: true } });
    expect((fetchMock.mock.calls[0][0] as string)).toContain("/api/agents/recepcion/stream");
  });

  it("sin memoryReadOnly igual manda memory {thread, resource} para que el turno persista", async () => {
    // Gotcha en vivo (2026-07-19, Task 13, ver CLAUDE.md): el route
    // /api/agents/:agentId/stream (no el -legacy) SOLO usa el body.memory
    // para resolver el thread — el threadId/resourceId de nivel superior se
    // ignoran para persistencia. Sin este campo, un turno "normal" no
    // persiste ningún mensaje (confirmado con curl directo al backend).
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    await streamAgentMessage({
      agentId: "laboral",
      threadId: "chat-s1",
      userId: "s1",
      message: "hola",
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.memory).toEqual({ thread: "chat-s1", resource: "s1" });
  });

  it("appendThreadMessages pega a /api/memory/save-messages con threadId/resourceId por mensaje", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await appendThreadMessages({
      threadId: "chat-s1",
      agentId: "recepcion",
      resourceId: "s1",
      messages: [{ role: "user", content: "hola" }],
    });
    expect(fetchMock.mock.calls[0][0]).toContain("/api/memory/save-messages?agentId=recepcion");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      messages: Array<Record<string, unknown>>;
    };
    expect(body.messages[0]).toEqual({ threadId: "chat-s1", resourceId: "s1", role: "user", content: "hola" });
  });
});
