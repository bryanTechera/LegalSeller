"use client";

import { useState } from "react";

import styles from "./revision.module.css";

export function AccesoForm({ onAcceso }: { onAcceso: () => void }) {
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const response = await fetch("/api/revision/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, nombre }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "No pudimos validar el acceso.");
      }
      onAcceso();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos validar el acceso.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className={styles.formAcceso} onSubmit={(event) => void handleSubmit(event)}>
      <h1 className={styles.titulo}>Revisión de Jurco</h1>
      <p className={styles.subtitulo}>Espacio del equipo legal para probar el asistente y dejar notas.</p>
      <div className={styles.campo}>
        <label htmlFor="revision-nombre">Tu nombre</label>
        <input id="revision-nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} autoComplete="name" />
      </div>
      <div className={styles.campo}>
        <label htmlFor="revision-clave">Clave de acceso</label>
        <input id="revision-clave" type="password" value={clave} onChange={(event) => setClave(event.target.value)} />
      </div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <button type="submit" className={styles.botonPrimario} disabled={enviando || !clave || nombre.trim().length < 2}>
        Entrar
      </button>
    </form>
  );
}
