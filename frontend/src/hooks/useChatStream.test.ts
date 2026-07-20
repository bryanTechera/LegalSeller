import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useChatStream } from "./useChatStream";

function sseResponse(text: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: "text-delta", payload: { text } })}\n\n`),
      );
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

async function seedConversation(result: { current: ReturnType<typeof useChatStream> }): Promise<void> {
  await act(async () => {
    await result.current.sendMessage("hola");
  });
  expect(result.current.messages).toHaveLength(2);
}

describe("useChatStream.startNewChat", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("limpia la conversación cuando el server rotó la sesión", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse("Hola, contame."))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChatStream());
    await seedConversation(result);

    await act(async () => {
      await result.current.startNewChat();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/chat/reset", { method: "POST" });
  });

  it("si la rotación falla, conserva los mensajes y avisa (el hilo viejo sigue vivo)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseResponse("Hola, contame."))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useChatStream());
    await seedConversation(result);

    await act(async () => {
      await result.current.startNewChat();
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.error).toMatch(/chat nuevo/i);
  });
});
