"use client";

import { useState } from "react";

import type { NotaConRespuestas } from "@/lib/revision/notas";

import styles from "./revision.module.css";

const ESTADO_LABEL: Record<NotaConRespuestas["estado"], string> = {
  ABIERTA: "Abierta — esperando al equipo",
  RESPONDIDA: "Respondida — esperando tu revisión",
  RESUELTA: "Resuelta",
};

export function NotaThread({
  nota,
  onResponder,
  onResolver,
}: {
  nota: NotaConRespuestas;
  onResponder: (notaId: string, texto: string) => Promise<void>;
  onResolver: (notaId: string) => Promise<void>;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleResponder = async () => {
    if (!respuesta.trim()) return;
    setEnviando(true);
    try {
      await onResponder(nota.id, respuesta.trim());
      setRespuesta("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.nota}>
      <p className={styles.notaMeta}>
        {nota.autor} · {new Date(nota.createdAt).toLocaleString("es-UY")} · {ESTADO_LABEL[nota.estado]}
      </p>
      {nota.citaTexto ? <p className={styles.notaCita}>“{nota.citaTexto}”</p> : null}
      <p>{nota.texto}</p>
      {nota.respuestas.map((r) => (
        <div key={r.id} className={r.origen === "DEV" ? styles.respuestaDev : styles.respuestaExperto}>
          <p className={styles.notaMeta}>{r.autor} · {new Date(r.createdAt).toLocaleString("es-UY")}</p>
          <p>{r.texto}</p>
        </div>
      ))}
      {nota.estado !== "RESUELTA" ? (
        <div className={styles.formNota}>
          <textarea
            value={respuesta}
            placeholder="Responder…"
            onChange={(event) => setRespuesta(event.target.value)}
            aria-label="Responder la nota"
          />
          <div className={styles.filaBotones}>
            <button type="button" className={styles.botonSecundario} onClick={() => void onResolver(nota.id)}>
              Marcar resuelta
            </button>
            <button type="button" className={styles.botonPrimario} disabled={enviando || !respuesta.trim()} onClick={() => void handleResponder()}>
              Responder
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
