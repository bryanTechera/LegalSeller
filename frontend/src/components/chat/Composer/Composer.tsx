"use client";

import styles from "./Composer.module.css";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** El padre valida (vacío, streaming) — acá solo se dispara. */
  onSubmit: () => void;
  isStreaming: boolean;
  /** Sin onStop, durante el streaming el botón de enviar queda deshabilitado. */
  onStop?: () => void;
  placeholder: string;
  label: string;
  inputId: string;
  maxLength?: number;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  className?: string;
}

/**
 * Composer del chat — presentación pura compartida por el chat real
 * (ChatPanel) y el de revisión (SesionView). Enter envía; Shift+Enter hace
 * salto de línea.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  isStreaming,
  onStop,
  placeholder,
  label,
  inputId,
  maxLength,
  inputRef,
  className,
}: ComposerProps) {
  return (
    <form
      className={className ? `${styles.composer} ${className}` : styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={inputId} className={styles.srOnly}>
        {label}
      </label>
      <textarea
        ref={inputRef}
        id={inputId}
        className={styles.input}
        value={value}
        maxLength={maxLength}
        rows={2}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {isStreaming && onStop ? (
        <button type="button" className={styles.stopButton} onClick={onStop} aria-label="Detener la respuesta">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" rx="2" />
          </svg>
        </button>
      ) : (
        <button
          type="submit"
          className={styles.sendButton}
          disabled={!value.trim() || isStreaming}
          aria-label="Enviar la consulta"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M2 18l16-8L2 2v6l11 2-11 2v6z" />
          </svg>
        </button>
      )}
    </form>
  );
}
