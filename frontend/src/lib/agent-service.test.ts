import { afterEach, describe, expect, it, vi } from "vitest";

import { appendThreadMessages, extractAssistantTexts, pedirSintesis, streamAgentMessage } from "./agent-service";

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

  it("streamAgentMessage propaga pedidoContactoHecho en el readOnly del requestContext", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    await streamAgentMessage({
      agentId: "laboral",
      threadId: "chat-s1",
      userId: "s1",
      message: "hola",
      pedidoContactoHecho: true,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      requestContext: { readOnly: Record<string, unknown> };
    };
    expect(body.requestContext.readOnly.pedidoContactoHecho).toBe(true);
  });
});

describe("extractAssistantTexts", () => {
  it("extrae el texto plano anidado en content.content (formato v2 verificado en vivo 2026-07-23)", () => {
    const payload = {
      messages: [
        {
          role: "user",
          content: { format: 2, parts: [{ type: "text", text: "hola" }], content: "hola" },
        },
        {
          role: "assistant",
          content: {
            format: 2,
            parts: [{ type: "tool-invocation", toolInvocation: { toolName: "buscar-documentos" } }],
            content: "Dejame tu nombre y un teléfono así te contactamos.",
          },
        },
      ],
    };
    expect(extractAssistantTexts(payload)).toEqual(["Dejame tu nombre y un teléfono así te contactamos."]);
  });

  it("acepta content como string plano y parts-only como fallback", () => {
    const payload = {
      messages: [
        { role: "assistant", content: "respuesta plana" },
        { role: "assistant", content: { parts: [{ type: "text", text: "por partes" }] } },
      ],
    };
    expect(extractAssistantTexts(payload)).toEqual(["respuesta plana", "por partes"]);
  });

  it("devuelve vacío ante payloads inesperados", () => {
    expect(extractAssistantTexts(null)).toEqual([]);
    expect(extractAssistantTexts({})).toEqual([]);
    expect(extractAssistantTexts({ messages: "no-array" })).toEqual([]);
  });
});

describe("pedirSintesis", () => {
  afterEach(() => vi.unstubAllGlobals());

  const material = {
    caso: { categoria: "laboral", subcategorias: ["despido"], estado: "CAPTADO", resumen: null },
    mensajes: [{ rol: "user" as const, texto: "Me despidieron" }],
  };

  it("postea el material al endpoint del backend y devuelve la síntesis", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          modelo: "google/gemini-3.5-flash-lite",
          sintesis: { situacion: "Despido sin causa.", pedido: "Saber qué cobra.", hechos: [], datosClave: [], faltantes: [] },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await pedirSintesis(material);

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sintesis-caso");
    expect(resultado.status).toBe("ok");
  });

  // El BFF nunca confía en la forma que cruza la red: un backend viejo o un
  // modelo nuevo pueden devolver algo distinto, y eso no puede escribirse en
  // la base ni romper la vista.
  it("degrada a error si el backend responde con una forma inesperada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect((await pedirSintesis(material)).status).toBe("error");
  });

  it("degrada a error si el backend no responde", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect((await pedirSintesis(material)).status).toBe("error");
  });
});
