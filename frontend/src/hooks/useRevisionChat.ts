"use client";

import { useCallback, useEffect, useState } from "react";

import type { NotaConRespuestas } from "@/lib/revision/notas";
import type { ItemTimeline } from "@/lib/revision/timeline";
import { createSseLineSplitter, parseSseData } from "@/utils/sse";

export interface DetalleSesion {
  sesion: { id: string; titulo: string | null; creadaPor: string | null };
  timeline: ItemTimeline[];
  notas: NotaConRespuestas[];
}

const GENERIC_ERROR = "No pudimos obtener una respuesta. Intentá de nuevo en unos instantes.";

/**
 * Detalle + chat de una sesión de revisión. A diferencia de useChatStream,
 * la fuente de verdad del transcript es el server (GET detalle, con
 * messageId persistidos de Mastra — el anclaje de notas los necesita):
 * durante el stream se muestran burbujas transitorias y al cerrar el turno
 * se refetchea el detalle (spec §8).
 */
export function useRevisionChat(sesionId: string) {
  const [detalle, setDetalle] = useState<DetalleSesion | null>(null);
  const [pendienteUsuario, setPendienteUsuario] = useState<string | null>(null);
  const [textoStreaming, setTextoStreaming] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const response = await fetch(`/api/revision/sesiones/${sesionId}`);
    if (!response.ok) {
      setError("No pudimos cargar la sesión. Recargá la página.");
      return;
    }
    setDetalle((await response.json()) as DetalleSesion);
  }, [sesionId]);

  useEffect(() => {
    // Wrapper inline: react-hooks/set-state-in-effect solo traza llamadas
    // directas a funciones referenciadas por identificador (ver useCallback
    // arriba); envolver la invocación en un IIFE async local evita el falso
    // positivo sin cambiar el comportamiento (carga en el montaje).
    void (async () => {
      await refetch();
    })();
  }, [refetch]);

  const sendMessage = useCallback(
    async (texto: string) => {
      const trimmed = texto.trim();
      if (!trimmed || isStreaming) return;
      setPendienteUsuario(trimmed);
      setTextoStreaming("");
      setIsStreaming(true);
      setError(null);
      try {
        const response = await fetch(`/api/revision/sesiones/${sesionId}/mensajes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
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
            if (event.kind === "text") setTextoStreaming((prev) => (prev ?? "") + event.text);
            if (event.kind === "error") throw new Error(GENERIC_ERROR);
          }
        }
        await refetch();
      } catch (caught) {
        setError(caught instanceof Error && caught.message ? caught.message : GENERIC_ERROR);
      } finally {
        setPendienteUsuario(null);
        setTextoStreaming(null);
        setIsStreaming(false);
      }
    },
    [sesionId, isStreaming, refetch],
  );

  return { detalle, isStreaming, pendienteUsuario, textoStreaming, error, sendMessage, refetch };
}
