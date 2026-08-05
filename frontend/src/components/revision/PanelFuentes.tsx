"use client";

import { useState } from "react";

import {
  citaDeBusqueda,
  citaDeFragmento,
  fragmentosPorScore,
  resumenDeBusqueda,
  type BusquedaCorpus,
  type FragmentoRecuperado,
} from "@/lib/revision/fuentes";

import styles from "./fuentes.module.css";

/** Largo del recorte de un fragmento antes de "Ver más". */
const RECORTE = 400;

interface PanelFuentesProps {
  /** Búsquedas de toda la conversación; el panel muestra las del mensaje elegido. */
  busquedas: BusquedaCorpus[];
  /** Respuesta seleccionada; sin selección el panel no carga fuentes. */
  messageIdSeleccionado: string | null;
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
        <div className={styles.filaMeta}>
          <span className={styles.numero} aria-hidden="true">
            {indice}
          </span>
          <span className={styles.score}>
            <span className={styles.scoreValor}>{fragmento.similarity.toFixed(2)}</span>
            <span className={styles.barra} aria-hidden="true">
              <span style={{ width: `${String(Math.round(fragmento.similarity * 100))}%` }} />
            </span>
          </span>
        </div>
        <span className={styles.documento}>{docLabel}</span>
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
        {/* La cabecera de un `details` no anuncia sola que se despliega:
            el texto lo dice, en vez de confiar en un triángulo. */}
        <span className={styles.desplegar}>{abierta ? "Ocultar resultados" : "Ver resultados"}</span>
      </summary>
      <Cuerpo busqueda={busqueda} onAnotar={onAnotar} />
    </details>
  );
}

export function PanelFuentes({ busquedas, messageIdSeleccionado, onAnotar }: PanelFuentesProps) {
  // Sin mensaje elegido no se carga ninguna fuente: el panel es el detalle de
  // una respuesta, no un índice de la conversación.
  if (messageIdSeleccionado === null) {
    return <p className={styles.vacio}>Elegí una respuesta del agente para ver qué consultó al corpus.</p>;
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
