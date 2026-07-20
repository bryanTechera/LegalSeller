"use client";

import { useCallback, useRef, useState } from "react";

import { createSseLineSplitter, parseSseData } from "@/utils/sse";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatStreamState {
  messages: ChatMessage[];
  isStreaming: boolean;
  isResetting: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  startNewChat: () => Promise<void>;
  stop: () => void;
}

const GENERIC_ERROR = "No pudimos obtener una respuesta. Intentá de nuevo en unos instantes.";
const RESET_ERROR = "No pudimos empezar un chat nuevo. Intentá de nuevo.";

/**
 * Chat state + SSE streaming against the BFF proxy (/api/chat/stream).
 * Transient UI state only (guideline: persistent state would live in a
 * store; a single in-page conversation does not need one).
 */
export function useChatStream(): ChatStreamState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const startNewChat = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setIsResetting(true);
    try {
      const response = await fetch("/api/chat/reset", { method: "POST" });
      if (!response.ok) throw new Error(RESET_ERROR);
      // Only clear after the server rotated the session: clearing on failure
      // would show a "new" chat that silently continues the old thread.
      setMessages([]);
      setError(null);
    } catch {
      setError(RESET_ERROR);
    } finally {
      setIsResetting(false);
    }
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // One in-flight request at a time; a new send cancels the previous one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setError(null);
    setIsStreaming(true);

    const appendToAssistant = (delta: string) => {
      setMessages((prev) =>
        prev.map((message) => (message.id === assistantId ? { ...message, content: message.content + delta } : message)),
      );
    };
    const dropEmptyAssistant = () => {
      setMessages((prev) => prev.filter((message) => message.id !== assistantId || message.content.length > 0));
    };

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? GENERIC_ERROR);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const feed = createSseLineSplitter();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const data of feed(decoder.decode(value, { stream: true }))) {
          const event = parseSseData(data);
          if (!event) continue;
          if (event.kind === "text") appendToAssistant(event.text);
          if (event.kind === "error") throw new Error(GENERIC_ERROR);
        }
      }
    } catch (caught) {
      if (controller.signal.aborted) return;
      dropEmptyAssistant();
      setError(caught instanceof Error && caught.message ? caught.message : GENERIC_ERROR);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsStreaming(false);
      }
    }
  }, []);

  return { messages, isStreaming, isResetting, error, sendMessage, startNewChat, stop };
}
