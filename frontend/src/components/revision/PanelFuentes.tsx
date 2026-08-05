"use client";

import { useState } from "react";

import {
  citaDeBusqueda,
  citaDeFragmento,
  fragmentosPorScore,
  resumenDeBusqueda,
  textoDelMapa,
  type BusquedaCorpus,
  type FragmentoRecuperado,
} from "@/lib/revision/fuentes";

import styles from "./fuentes.module.css";

/** Largo del recorte de un fragmento antes de "Ver más". */
const RECORTE = 400;

interface PanelFuentesProps {
  busquedas: BusquedaCorpus[];
  /** Respuesta seleccionada; null muestra el mapa de todo el chat. */
  messageIdSeleccionado: string | null;
  /** Clic en una línea del mapa: el padre selecciona esa respuesta. */
  onIrARespuesta: (messageId: string) => void;
  onAnotar: (messageId: string | null, cita: string) => void;
}

function Fragmento({
  fragmento,
  indice,
  onAnotar,
}: {
  fragmento: FragmentoRecuperado;
  /** Posición 1-based por score dentro de la búsqueda: es el número que se muestra. */
  indice: number;
  onAnotar: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const largo = fragmento.content.length > RECORTE;
  const texto = expandido || !largo ? fragmento.content : `${fragmento.content.slice(0, RECORTE)}…`;
  const docLabel = fragmento.section ? `${fragmento.documentTitle} — ${fragmento.section}` : fragmento.documentTitle;

  return (
    <article className={styles.fragmento}>
      <header className={styles.fragmentoMeta}>
        <span className={styles.numero} aria-hidden="true">
          {indice}
        </span>
        <span className={styles.documento}>{docLabel}</span>
        <span className={styles.score}>
          <span className={styles.scoreValor}>{fragmento.similarity.toFixed(2)}</span>
          <span className={styles.barra} aria-hidden="true">
            <span style={{ width: `${String(Math.round(fragmento.similarity * 100))}%` }} />
          </span>
        </span>
      </header>
      <p className={styles.fragmentoTexto}>{texto}</p>
      <div className={styles.filaAcciones}>
        {largo ? (
          <button
            type="button"
            className={styles.botonChico}
            aria-label={`${expandido ? "Ver menos" : "Ver más"} del fragmento de ${docLabel}`}
            onClick={() => setExpandido(!expandido)}
          >
            {expandido ? "Ver menos" : "Ver más"}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.botonChico}
          aria-label={`Dejar nota sobre este fragmento: ${docLabel} (fragmento ${String(indice)})`}
          onClick={onAnotar}
        >
          Dejar nota sobre este fragmento
        </button>
      </div>
    </article>
  );
}

/**
 * Cabecera de una búsqueda: lo único visible cuando está colapsada. Va con
 * `span`s y no con `p` porque también es el contenido de un `summary`, cuyo
 * modelo de contenido es phrasing content.
 */
function Cabecera({ busqueda }: { busqueda: BusquedaCorpus }) {
  const filtros = [busqueda.categoria, ...busqueda.subcategorias].filter(Boolean).join(" · ");
  return (
    <>
      <span className={styles.etiqueta}>Consulta del agente</span>
      <span className={styles.consulta}>{busqueda.consulta || "(consulta ilegible)"}</span>
      {filtros ? <span className={styles.filtros}>{filtros}</span> : null}
      <span className={busqueda.estado === "ok" ? styles.resumen : styles.resumenVacio}>
        {resumenDeBusqueda(busqueda)}
      </span>
    </>
  );
}

function Cuerpo({
  busqueda,
  onAnotar,
}: {
  busqueda: BusquedaCorpus;
  onAnotar: (messageId: string | null, cita: string) => void;
}) {
  return (
    <div className={styles.resultados}>
      {busqueda.estado === "ok" ? (
        fragmentosPorScore(busqueda.fragmentos).map((fragmento, indice) => (
          <Fragmento
            key={fragmento.documentId + String(fragmento.similarity)}
            fragmento={fragmento}
            indice={indice + 1}
            onAnotar={() => onAnotar(busqueda.messageId, citaDeFragmento(fragmento))}
          />
        ))
      ) : (
        <p role="status" className={styles.aviso}>
          {busqueda.estado === "empty"
            ? `Sin resultados: ningún fragmento del corpus de ${busqueda.categoria ?? "esta categoría"} superó el umbral de relevancia.`
            : busqueda.estado === "error"
              ? "La búsqueda falló: el agente respondió sin fuentes del corpus."
              : "No pudimos leer el resultado de esta búsqueda (formato desconocido)."}
        </p>
      )}

      <button
        type="button"
        className={styles.botonChico}
        aria-label={`Dejar nota sobre esta búsqueda: «${busqueda.consulta.length > 50 ? `${busqueda.consulta.slice(0, 50)}…` : busqueda.consulta}»`}
        onClick={() => onAnotar(busqueda.messageId, citaDeBusqueda(busqueda))}
      >
        Dejar nota sobre esta búsqueda
      </button>
    </div>
  );
}

function Busqueda({
  busqueda,
  colapsable,
  onAnotar,
}: {
  busqueda: BusquedaCorpus;
  /** Con varias búsquedas en la misma respuesta, cada una arranca colapsada. */
  colapsable: boolean;
  onAnotar: (messageId: string | null, cita: string) => void;
}) {
  // `open` controlado: sin el estado, un re-render del panel (expandir un
  // fragmento, guardar una nota) volvería a cerrar lo que el revisor abrió.
  const [abierta, setAbierta] = useState(false);

  if (!colapsable) {
    return (
      <section className={styles.busqueda}>
        <div className={styles.cabecera}>
          <Cabecera busqueda={busqueda} />
        </div>
        <Cuerpo busqueda={busqueda} onAnotar={onAnotar} />
      </section>
    );
  }

  return (
    <details className={styles.busqueda} open={abierta} onToggle={(event) => setAbierta(event.currentTarget.open)}>
      <summary className={styles.cabecera}>
        <Cabecera busqueda={busqueda} />
      </summary>
      <Cuerpo busqueda={busqueda} onAnotar={onAnotar} />
    </details>
  );
}

export function PanelFuentes({ busquedas, messageIdSeleccionado, onIrARespuesta, onAnotar }: PanelFuentesProps) {
  if (busquedas.length === 0) {
    // Redactado sin sujeto ("chat"/"sesión") a propósito: el componente se
    // monta tal cual en el board (chats de consultante) y en /revision
    // (sesiones de prueba) — mismo patrón que "Esta respuesta no consultó
    // el corpus." unas líneas más abajo, que ya es agnóstico de pantalla.
    return <p className={styles.vacio}>No se consultó el corpus.</p>;
  }

  if (messageIdSeleccionado === null) {
    return (
      <div className={styles.mapa}>
        <p className={styles.contador}>{textoDelMapa(busquedas)}</p>
        <ul className={styles.listaMapa}>
          {busquedas.map((busqueda) => (
            <li key={busqueda.spanId}>
              <button
                type="button"
                className={busqueda.estado === "ok" ? styles.lineaMapa : styles.lineaMapaVacia}
                disabled={busqueda.messageId === null}
                onClick={() => {
                  if (busqueda.messageId !== null) onIrARespuesta(busqueda.messageId);
                }}
              >
                <span className={styles.consultaMapa}>{busqueda.consulta || "(consulta ilegible)"}</span>
                <span className={styles.etiqueta}>
                  {busqueda.messageId === null
                    ? "sin respuesta asociada"
                    : busqueda.estado === "ok"
                      ? `${String(busqueda.fragmentos.length)} · ${(busqueda.fragmentos[0]?.similarity ?? 0).toFixed(2)}`
                      : "sin resultados"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const deLaRespuesta = busquedas.filter((busqueda) => busqueda.messageId === messageIdSeleccionado);
  if (deLaRespuesta.length === 0) {
    return <p className={styles.vacio}>Esta respuesta no consultó el corpus.</p>;
  }

  return (
    <div className={styles.detalle}>
      {deLaRespuesta.map((busqueda) => (
        <Busqueda key={busqueda.spanId} busqueda={busqueda} colapsable={deLaRespuesta.length > 1} onAnotar={onAnotar} />
      ))}
    </div>
  );
}
