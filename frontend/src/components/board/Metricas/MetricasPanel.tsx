"use client";

import { useState } from "react";
import useSWR from "swr";

import type { Metricas } from "@/lib/board/metricas";
import type { Rango } from "@/lib/board/rango";

import { GraficoBarras } from "./GraficoBarras";
import { GraficoLinea } from "./GraficoLinea";
import { TarjetaKpi } from "./TarjetaKpi";
import styles from "./metricas.module.css";

const RANGOS: { valor: Rango; etiqueta: string }[] = [
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "90d", etiqueta: "90 días" },
  { valor: "todo", etiqueta: "Todo" },
];

async function traer(url: string): Promise<Metricas> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar las métricas");
  return (await response.json()) as Metricas;
}

function porcentaje(parte: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((parte / total) * 100)}%`;
}

export function MetricasPanel() {
  const [rango, setRango] = useState<Rango>("30d");
  const { data, error, isLoading } = useSWR(`/api/board/metricas?rango=${rango}`, traer, {
    dedupingInterval: 30_000,
  });

  return (
    <section>
      <header className={styles.encabezado}>
        <h1 className={styles.titulo}>Métricas</h1>
        <div className={styles.rangos} role="group" aria-label="Rango temporal">
          {RANGOS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              className={opcion.valor === rango ? `${styles.rango} ${styles.rangoActivo}` : styles.rango}
              aria-pressed={opcion.valor === rango}
              onClick={() => setRango(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </header>

      {error ? <p role="alert" className={styles.error}>No pudimos cargar las métricas.</p> : null}
      {isLoading || !data ? <p className={styles.cargando}>Cargando…</p> : (
        <>
          <div className={styles.kpis}>
            <TarjetaKpi etiqueta="Conversaciones" valor={String(data.funnel.iniciadas)} />
            <TarjetaKpi
              etiqueta="Tasa de captación"
              valor={porcentaje(data.funnel.captadas, data.funnel.iniciadas)}
            />
            <TarjetaKpi etiqueta="Casos captados" valor={String(data.funnel.captadas)} />
            <TarjetaKpi
              etiqueta="Fuera de cobertura"
              valor={String(data.funnel.fueraDeCobertura)}
            />
          </div>

          <GraficoBarras
            titulo="Funnel de captación"
            datos={[
              { nombre: "Iniciadas", valor: data.funnel.iniciadas },
              { nombre: "Clasificadas", valor: data.funnel.clasificadas },
              { nombre: "Con caso", valor: data.funnel.conCaso },
              { nombre: "Captadas", valor: data.funnel.captadas },
            ]}
          />

          <GraficoLinea
            titulo="Conversaciones por día"
            datos={data.volumen.porDia.map((punto) => ({ nombre: punto.fecha, valor: punto.valor }))}
          />

          <GraficoBarras
            titulo="Demanda por categoría"
            datos={data.demanda.categorias.map((fila) => ({
              nombre: fila.categoria,
              valor: fila.conversaciones,
            }))}
          />

          <GraficoBarras
            titulo="Uso de herramientas"
            datos={data.agente.tools.map((fila) => ({ nombre: fila.tool, valor: fila.llamadas }))}
          />

          <GraficoBarras
            titulo="Consultas por hora del día"
            datos={data.volumen.porHora.map((franja) => ({
              nombre: `${String(franja.hora).padStart(2, "0")}h`,
              valor: franja.conversaciones,
            }))}
          />

          <section className={styles.bloque}>
            <h2 className={styles.subtitulo}>Pedidos fuera de cobertura</h2>
            <p className={styles.ayuda}>
              Lo que consultan y todavía no cubrimos. Entrada directa al roadmap de categorías.
            </p>
            <ul className={styles.lista}>
              {data.demanda.fueraDeCobertura.map((pedido) => (
                <li key={pedido.conversationId} className={styles.item}>
                  <span className={styles.fecha}>{pedido.fecha.slice(0, 10)}</span>
                  <span>{pedido.resumen ?? "Sin resumen registrado"}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
