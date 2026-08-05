"use client";

import { useState } from "react";

import type { NotaConRespuestas } from "@/lib/revision/notas";

import { NotaThread } from "./NotaThread";
import styles from "./revision.module.css";

interface NotasPaginadasProps {
  notas: NotaConRespuestas[];
  onResponder: (notaId: string, texto: string) => Promise<boolean>;
  onResolver: (notaId: string) => Promise<boolean>;
}

/**
 * Muestra las notas de a una con navegación. Va donde las notas comparten un
 * lugar fijo con otra información (el bloque de la conversación en el board):
 * apiladas, veinte notas empujan todo lo demás fuera de la pantalla.
 */
export function NotasPaginadas({ notas, onResponder, onResolver }: NotasPaginadasProps) {
  const [indice, setIndice] = useState(0);

  if (notas.length === 0) return null;

  // Clamp en vez de estado derivado: si el padre recarga con menos notas, el
  // índice viejo apuntaría fuera del arreglo y el render explotaría.
  const actual = Math.min(indice, notas.length - 1);
  const nota = notas[actual];

  return (
    <div className={styles.notasPaginadas}>
      {notas.length > 1 ? (
        <div className={styles.navNotas}>
          <button
            type="button"
            className={styles.botonSecundario}
            disabled={actual === 0}
            onClick={() => setIndice(actual - 1)}
          >
            Anterior
          </button>
          <span className={styles.contadorNotas} aria-live="polite">
            Nota {actual + 1} de {notas.length}
          </span>
          <button
            type="button"
            className={styles.botonSecundario}
            disabled={actual === notas.length - 1}
            onClick={() => setIndice(actual + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
      <NotaThread key={nota.id} nota={nota} onResponder={onResponder} onResolver={onResolver} />
    </div>
  );
}
