"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { BrandMark } from "@/components/brand/BrandMark";
import { useChatStream } from "@/hooks/useChatStream";

import styles from "./ChatPanel.module.css";

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Preguntas de ejemplo por categoría, en orden de volumen esperado de
 * consultas (ver docs/plans/2026-07-19-analisis-referencia-alex-ai.md §3).
 */
const SUGGESTED_QUESTIONS = [
  { category: "Laboral", question: "¿Me pueden despedir estando con certificado médico?" },
  { category: "Alquileres", question: "¿Qué pasa si este mes no llego a pagar el alquiler?" },
  { category: "Consumo", question: "¿Cómo reclamo por un producto fallado?" },
  { category: "Familia", question: "¿Cómo se pide la tenencia compartida de los hijos?" },
];

export function ChatPanel() {
  const { messages, isStreaming, error, sendMessage, stop } = useChatStream();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = messages.length === 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // El composer se re-monta al pasar de estado vacío a conversación.
  useEffect(() => {
    inputRef.current?.focus();
  }, [isEmpty]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isStreaming || !draft.trim()) return;
    void sendMessage(draft);
    setDraft("");
  };

  const composer = (
    <form className={styles.composer} onSubmit={handleSubmit}>
      <label htmlFor="chat-input" className={styles.srOnly}>
        Escribí tu consulta
      </label>
      <textarea
        ref={inputRef}
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
        <button type="button" className={styles.stopButton} onClick={stop} aria-label="Detener la respuesta">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" rx="2" />
          </svg>
        </button>
      ) : (
        <button type="submit" className={styles.sendButton} disabled={!draft.trim()} aria-label="Enviar la consulta">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M2 18l16-8L2 2v6l11 2-11 2v6z" />
          </svg>
        </button>
      )}
    </form>
  );

  if (isEmpty) {
    return (
      <section className={styles.panel} aria-label="Chat de consultas legales">
        <div className={styles.hero}>
          <span className={styles.heroMark}>
            <BrandMark size={44} />
          </span>
          <h2 className={styles.heroTitle}>¿Qué necesitás resolver hoy?</h2>
          <p className={styles.heroSubtitle}>Orientación legal en segundos, siempre con la fuente citada.</p>
          {composer}
          <ul className={styles.suggestions}>
            {SUGGESTED_QUESTIONS.map(({ category, question }) => (
              <li key={category}>
                <button type="button" className={styles.suggestion} onClick={() => void sendMessage(question)}>
                  <span className={styles.suggestionCategory}>{category}</span>
                  <span className={styles.suggestionText}>{question}</span>
                </button>
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-label="Chat de consultas legales">
      <div ref={scrollRef} className={styles.messages} aria-live="polite">
        {messages.map((message) => (
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
        ))}
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {composer}
    </section>
  );
}
