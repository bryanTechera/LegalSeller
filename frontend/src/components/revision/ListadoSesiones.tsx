"use client";

import { useState } from "react";

import type { SesionResumen } from "@/lib/revision/sesiones";

import styles from "./revision.module.css";

// Re-export type-only: la página importa el tipo desde acá sin tocar la lib
// server-side (el import type se borra en compile y no dispara server-only).
export type { SesionResumen };

export function ListadoSesiones({
  sesiones,
  onAbrir,
  onCrear,
}: {
  sesiones: SesionResumen[];
  onAbrir: (id: string) => void;
  onCrear: (titulo: string) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [creando, setCreando] = useState(false);

  const handleCrear = async () => {
    setCreando(true);
    try {
      await onCrear(titulo.trim());
      setTitulo("");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div>
      <div className={styles.filaNueva}>
        <input
          value={titulo}
          placeholder="Título de la nueva sesión (opcional)"
          onChange={(event) => setTitulo(event.target.value)}
          aria-label="Título de la nueva sesión"
        />
        <button type="button" className={styles.botonPrimario} onClick={() => void handleCrear()} disabled={creando}>
          Nueva sesión de revisión
        </button>
      </div>
      <ul className={styles.listado}>
        {sesiones.map((sesion) => (
          <li key={sesion.id}>
            <button type="button" className={styles.tarjetaSesion} onClick={() => onAbrir(sesion.id)}>
              <span>
                <span>{sesion.titulo ?? "Sesión sin título"}</span>
                <br />
                <span className={styles.tarjetaMeta}>
                  {sesion.creadaPor ?? "—"} · {new Date(sesion.actualizadaEn).toLocaleString("es-UY")}
                </span>
              </span>
              <span className={styles.badges}>
                {sesion.origenRevision === "AUTONOMA" ? (
                  <span className={styles.badgeAutonoma}>Generada por el asistente técnico</span>
                ) : null}
                {sesion.notasAbiertas > 0 ? <span className={styles.badgeAbierta}>{sesion.notasAbiertas} abiertas</span> : null}
                {sesion.notasRespondidas > 0 ? (
                  <span className={styles.badgeRespondida}>{sesion.notasRespondidas} con respuesta</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {sesiones.length === 0 ? <p className={styles.subtitulo}>Todavía no hay sesiones. Creá la primera.</p> : null}
    </div>
  );
}
