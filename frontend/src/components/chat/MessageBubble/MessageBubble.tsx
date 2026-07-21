import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { BrandMark } from "@/components/brand/BrandMark";

import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  /** Indicador "Buscando en el corpus…" (assistant streameando sin contenido aún). */
  showThinking?: boolean;
  /** Se emite como data-message-id — anclaje de notas en la pantalla de revisión. */
  anchorId?: string;
}

/**
 * Burbuja de mensaje del chat — presentación pura, compartida por el chat real
 * (ChatPanel) y el chat de revisión (SesionView). Todo cambio visual acá
 * afecta AMBAS pantallas.
 */
export function MessageBubble({ role, content, showThinking = false, anchorId }: MessageBubbleProps) {
  return (
    <article
      className={role === "user" ? styles.userMessage : styles.assistantMessage}
      aria-label={role === "user" ? "Tu mensaje" : "Respuesta del asistente"}
      data-message-id={anchorId}
    >
      {role === "assistant" ? (
        <>
          <span className={styles.assistantHeader} aria-hidden="true">
            <span className={styles.assistantAvatar}>
              <BrandMark size={14} />
            </span>
            <span className={styles.assistantName}>Jurco</span>
          </span>
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            {showThinking ? <span className={styles.thinking}>Buscando en el corpus…</span> : null}
          </div>
        </>
      ) : (
        <p>{content}</p>
      )}
    </article>
  );
}
