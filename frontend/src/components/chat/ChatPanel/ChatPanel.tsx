"use client";

import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand/BrandMark";
import { Composer } from "@/components/chat/Composer";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useChatStream } from "@/hooks/useChatStream";

import styles from "./ChatPanel.module.css";

const MAX_MESSAGE_LENGTH = 4000;

/**
 * Preguntas de ejemplo dentro del alcance habilitado de v1 (solo
 * Laboral → Despido, ver docs/dominio-consultas.md §2). El eyebrow es el
 * subtema del despido; al habilitar más categorías vuelve a ser la categoría.
 */
const SUGGESTED_QUESTIONS = [
  { topic: "Indemnización", question: "¿Cuánto me corresponde si me despiden sin causa?" },
  { topic: "Certificación médica", question: "¿Me pueden despedir estando certificado?" },
  { topic: "Embarazo", question: "¿Pueden despedirme estando embarazada?" },
  { topic: "Plazos", question: "¿Cuánto tiempo tengo para reclamar un despido?" },
];

export function ChatPanel() {
  const { messages, isStreaming, isResetting, error, sendMessage, startNewChat, stop } = useChatStream();
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

  const enviar = () => {
    if (isStreaming || isResetting || !draft.trim()) return;
    void sendMessage(draft);
    setDraft("");
  };

  const composer = (heroStyle = false) => (
    <Composer
      value={draft}
      onChange={setDraft}
      onSubmit={enviar}
      isStreaming={isStreaming}
      onStop={stop}
      placeholder="Escribí tu consulta…"
      label="Escribí tu consulta"
      inputId="chat-input"
      maxLength={MAX_MESSAGE_LENGTH}
      inputRef={inputRef}
      className={heroStyle ? styles.heroComposer : undefined}
    />
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
          {composer(true)}
          <p className={styles.suggestionsLabel}>Resolvé tus dudas sobre despidos</p>
          <ul className={styles.suggestions}>
            {SUGGESTED_QUESTIONS.map(({ topic, question }) => (
              <li key={topic}>
                <button type="button" className={styles.suggestion} onClick={() => void sendMessage(question)}>
                  <span className={styles.suggestionCategory}>{topic}</span>
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
      <header className={styles.panelHeader}>
        <button
          type="button"
          className={styles.newChatButton}
          onClick={() => void startNewChat()}
          disabled={isResetting}
        >
          <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M8 3v10M3 8h10" />
          </svg>
          Nuevo chat
        </button>
      </header>
      <div ref={scrollRef} className={styles.messages} aria-live="polite">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            role={message.role}
            content={message.content}
            showThinking={isStreaming && message.content.length === 0}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {composer()}
    </section>
  );
}
