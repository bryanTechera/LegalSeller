import styles from "./metricas.module.css";

export function TarjetaKpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <article className={styles.kpi}>
      <span className={styles.kpiEtiqueta}>{etiqueta}</span>
      <strong className={styles.kpiValor}>{valor}</strong>
    </article>
  );
}
