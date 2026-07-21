"use client";

import { useState } from "react";

import styles from "./revision.module.css";

interface NotaComposerProps {
  /** Pasaje seleccionado que la nota cita; null en nota de mensaje entero o general. */
  cita: string | null;
  onCancelar: () => void;
  /** Devuelve true si se guardó (el padre cierra el composer); false muestra error acá. */
  onGuardar: (texto: string) => Promise<boolean>;
}

export function NotaComposer({ cita, onCancelar, onGuardar }: NotaComposerProps) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    const ok = await onGuardar(texto.trim());
    setEnviando(false);
    if (!ok) setError("No pudimos guardar la nota. Intentá de nuevo.");
  };

  return (
    <div className={styles.formNotaCard}>
      {cita ? <blockquote className={styles.notaCita}>{cita}</blockquote> : null}
      <div className={styles.formNota}>
        <textarea
          value={texto}
          placeholder="¿Qué observaste en esta respuesta?"
          onChange={(event) => setTexto(event.target.value)}
          aria-label="Texto de la nota"
        />
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <div className={styles.filaBotones}>
          <button type="button" className={styles.botonSecundario} onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.botonPrimario}
            disabled={enviando || !texto.trim()}
            onClick={() => void guardar()}
          >
            Guardar nota
          </button>
        </div>
      </div>
    </div>
  );
}
