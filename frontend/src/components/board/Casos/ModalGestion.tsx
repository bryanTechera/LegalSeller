"use client";

import { useEffect, useRef, useState } from "react";

import type { GestionCaso } from "@/lib/casos/gestion";

import styles from "./casos.module.css";
import { GESTIONES, etiquetaGestion } from "./gestiones";

// El board se lee desde Uruguay; sin timeZone explícito, JS formatea con la
// zona del proceso (UTC en Railway) y todo horario queda corrido.
function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  casoId: string;
  gestion: GestionCaso;
  onGuardado: (gestion: GestionCaso) => void;
}

export function ModalGestion({ casoId, gestion, onGuardado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<string>(gestion.estado);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);
  const disparador = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const abrir = () => {
    // Cada apertura parte del estado vigente: una selección a medio elegir de
    // la vez anterior no puede sobrevivir a un cierre.
    setSeleccion(gestion.estado);
    setNota("");
    setError(false);
    setAbierto(true);
  };

  const cerrar = () => {
    if (guardando) return;
    setAbierto(false);
    disparador.current?.focus();
  };

  useEffect(() => {
    if (!abierto) return;
    panel.current?.focus();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape" || guardando) return;
      setAbierto(false);
      disparador.current?.focus();
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto, guardando]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const response = await fetch(`/api/board/casos/${casoId}/gestion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gestion: seleccion, nota }),
      });
      if (response.ok) {
        const { gestion: actualizada } = (await response.json()) as { gestion: GestionCaso };
        onGuardado(actualizada);
        // Cierra sin pasar por `cerrar`, que se niega mientras `guardando`
        // sigue en true (recién baja en el finally).
        setAbierto(false);
        disparador.current?.focus();
      } else {
        setError(true);
      }
    } catch {
      // El botón se rehabilita en el finally: sin él queda muerto y nadie
      // puede reintentar marcar el caso.
      setError(true);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <button ref={disparador} type="button" className={styles.flotante} onClick={abrir}>
        Gestionar
      </button>

      {abierto ? (
        <div className={styles.overlay}>
          {/* El fondo es un botón para que el click cierre sin que jsx-a11y
              tenga que tragarse un div clickeable; queda fuera del árbol de
              accesibilidad porque la × y Cancelar ya son la salida anunciada. */}
          <button
            type="button"
            className={styles.fondo}
            aria-hidden="true"
            tabIndex={-1}
            onClick={cerrar}
          />
          <div
            ref={panel}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-gestion"
            tabIndex={-1}
          >
            <div className={styles.cabeceraModal}>
              <h2 className={styles.subtitulo} id="titulo-gestion">
                Gestión del caso
              </h2>
              <button type="button" className={styles.cerrar} onClick={cerrar} aria-label="Cerrar">
                ×
              </button>
            </div>
            <p className={styles.ayuda}>
              En qué anda este lead. Es independiente del estado que dejó la conversación.
            </p>

            <div className={styles.gestiones}>
              {GESTIONES.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  className={
                    seleccion === opcion.valor
                      ? `${styles.botonGestion} ${styles.botonGestionActivo}`
                      : styles.botonGestion
                  }
                  aria-pressed={seleccion === opcion.valor}
                  disabled={guardando}
                  onClick={() => setSeleccion(opcion.valor)}
                >
                  {opcion.etiqueta}
                </button>
              ))}
            </div>

            <label className={styles.etiqueta} htmlFor="nota-gestion">
              Nota del cambio (opcional)
            </label>
            <input
              id="nota-gestion"
              className={styles.input}
              value={nota}
              onChange={(evento) => setNota(evento.target.value)}
              placeholder="Por qué cambiás el estado"
              disabled={guardando}
            />

            {error ? (
              <p role="status" className={styles.aviso}>
                No pudimos guardar el cambio. Probá de nuevo.
              </p>
            ) : null}

            <div className={styles.accionesModal}>
              <button
                type="button"
                className={styles.botonSecundario}
                onClick={cerrar}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.boton}
                onClick={() => void guardar()}
                disabled={guardando || seleccion === gestion.estado}
              >
                {guardando ? "Guardando…" : "Guardar cambio"}
              </button>
            </div>

            <h3 className={styles.tituloBloque}>Historial</h3>
            {gestion.historial.length === 0 ? (
              <p className={styles.etiqueta}>Todavía nadie gestionó este caso.</p>
            ) : (
              <ul className={styles.notas}>
                {gestion.historial.map((cambio) => (
                  <li key={cambio.id}>
                    <p className={styles.etiqueta}>
                      {cambio.de
                        ? `${etiquetaGestion(cambio.de)} → ${etiquetaGestion(cambio.a)}`
                        : etiquetaGestion(cambio.a)}{" "}
                      · {cambio.por} · {fecha(cambio.createdAt)}
                    </p>
                    {cambio.nota ? <p>{cambio.nota}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
