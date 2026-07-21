"use client";

import { useState } from "react";

import type { NotaConRespuestas } from "@/lib/revision/notas";

import styles from "./revision.module.css";

const CHIP: Record<NotaConRespuestas["estado"], { label: string; clase: string; title: string }> = {
  ABIERTA: { label: "Abierta", clase: styles.chipAbierta, title: "Esperando al equipo de desarrollo" },
  RESPONDIDA: { label: "Respondida", clase: styles.chipRespondida, title: "Esperando tu revisión" },
  RESUELTA: { label: "Resuelta", clase: styles.chipResuelta, title: "Cerrada" },
};

const BORDE: Record<NotaConRespuestas["estado"], string> = {
  ABIERTA: styles.notaAbierta,
  RESPONDIDA: styles.notaRespondida,
  RESUELTA: styles.notaResueltaCard,
};

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Hilo de nota estilo code review de GitHub: tarjeta con estado, cita del
 * pasaje, respuestas anidadas, responder expandible y resolver. Los hilos
 * resueltos colapsan a una línea expandible.
 */
export function NotaThread({
  nota,
  onResponder,
  onResolver,
}: {
  nota: NotaConRespuestas;
  onResponder: (notaId: string, texto: string) => Promise<boolean>;
  onResolver: (notaId: string) => Promise<boolean>;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (nota.estado === "RESUELTA" && !expandida) {
    const cuenta = nota.respuestas.length === 1 ? "1 respuesta" : `${String(nota.respuestas.length)} respuestas`;
    return (
      <button type="button" className={styles.notaResuelta} onClick={() => setExpandida(true)}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 8.5l3.5 3.5L13 4.5" />
        </svg>
        Resuelta · {cuenta} · {nota.autor}
      </button>
    );
  }

  const responder = async () => {
    if (!respuesta.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    const ok = await onResponder(nota.id, respuesta.trim());
    setEnviando(false);
    if (ok) {
      setRespuesta("");
      setRespondiendo(false);
    } else {
      setError("No pudimos enviar la respuesta. Intentá de nuevo.");
    }
  };

  const resolver = async () => {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    const ok = await onResolver(nota.id);
    setEnviando(false);
    if (!ok) setError("No pudimos resolver la nota. Intentá de nuevo.");
  };

  const chip = CHIP[nota.estado];

  return (
    <div className={`${styles.nota} ${BORDE[nota.estado]}`}>
      <div className={styles.notaHeader}>
        <span className={styles.notaAutor}>{nota.autor}</span>
        <span className={styles.notaFecha}>{fechaCorta(nota.createdAt)}</span>
        <span className={chip.clase} title={chip.title}>
          {chip.label}
        </span>
      </div>
      {nota.citaTexto ? <blockquote className={styles.notaCita}>{nota.citaTexto}</blockquote> : null}
      <p className={styles.notaTexto}>{nota.texto}</p>
      {nota.respuestas.length > 0 ? (
        <div className={styles.respuestas}>
          {nota.respuestas.map((r) => (
            <div key={r.id} className={`${styles.respuesta} ${r.origen === "DEV" ? styles.respuestaDev : styles.respuestaExperto}`}>
              <p className={styles.respuestaMeta}>
                {r.autor} · {fechaCorta(r.createdAt)}
              </p>
              <p>{r.texto}</p>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {nota.estado === "RESUELTA" ? (
        <button type="button" className={styles.linkSutil} onClick={() => setExpandida(false)}>
          Ocultar
        </button>
      ) : respondiendo ? (
        <div className={styles.formNota}>
          <textarea
            value={respuesta}
            placeholder="Responder…"
            onChange={(event) => setRespuesta(event.target.value)}
            aria-label="Responder la nota"
          />
          <div className={styles.filaBotones}>
            <button
              type="button"
              className={styles.botonSecundario}
              onClick={() => {
                setRespondiendo(false);
                setRespuesta("");
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={styles.botonPrimario}
              disabled={enviando || !respuesta.trim()}
              onClick={() => void responder()}
            >
              Responder
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.notaPie}>
          <button type="button" className={styles.responderPlaceholder} onClick={() => setRespondiendo(true)}>
            Responder…
          </button>
          <button type="button" className={styles.botonSecundario} disabled={enviando} onClick={() => void resolver()}>
            Resolver
          </button>
        </div>
      )}
    </div>
  );
}
