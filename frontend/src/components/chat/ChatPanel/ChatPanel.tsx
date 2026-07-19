"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useChatStream } from "@/hooks/useChatStream";

import styles from "./ChatPanel.module.css";

const MAX_MESSAGE_LENGTH = 4000;

export function ChatPanel() {
  const { messages, isStreaming, error, sendMessage, stop } = useChatStream();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isStreaming || !draft.trim()) return;
    void sendMessage(draft);
    setDraft("");
  };

  return (
    <section className={styles.panel} aria-label="Chat de consultas legales">
      <div ref={scrollRef} className={styles.messages} aria-live="polite">
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Hacé tu consulta</p>
            <p className={styles.emptyHint}>
              Respondemos en base a los documentos legales del corpus, citando siempre la fuente.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={message.role === "user" ? styles.userMessage : styles.assistantMessage}
              aria-label={message.role === "user" ? "Tu mensaje" : "Respuesta del asistente"}
            >
              {message.role === "assistant" ? (
                <div className={styles.markdown}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  {isStreaming && message.content.length === 0 ? (
                    <span className={styles.thinking}>Buscando en el corpus…</span>
                  ) : null}
                </div>
              ) : (
                <p>{message.content}</p>
              )}
            </article>
          ))
        )}
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      <form className={styles.composer} onSubmit={handleSubmit}>
        <label htmlFor="chat-input" className={styles.srOnly}>
          Escribí tu consulta
        </label>
        <textarea
          id="chat-input"
          className={styles.input}
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          placeholder="Escribí tu consulta…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit(event);
            }
          }}
        />
        {isStreaming ? (
          <button type="button" className={styles.stopButton} onClick={stop}>
            Detener
          </button>
        ) : (
          <button type="submit" className={styles.sendButton} disabled={!draft.trim()}>
            Enviar
          </button>
        )}
      </form>
    </section>
  );
}
