"use client";

import Link from "next/link";
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

function segundos(ms: number): string {
  if (ms === 0) return "—";
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Suma el costo de los modelos conocidos. Un modelo sin precio en la tabla
 * aporta `null`, y eso se marca como total parcial en vez de esconderse: un
 * costo que parece completo pero omite un modelo miente más que uno marcado.
 * Si NINGÚN modelo del rango tiene precio, la suma de ese conjunto vacío es
 * 0 — y "USD 0.00 (parcial)" se lee como gasto real, no como "no tenemos
 * precio para nada de lo que corrió". Ese caso corta antes a "sin dato".
 */
export function costoTotal(modelos: Metricas["agente"]["modelos"]): string {
  if (modelos.length === 0) return "—";
  const conocidos = modelos.filter((modelo) => modelo.costoUsd !== null);
  if (conocidos.length === 0) return "sin dato";
  const total = conocidos.reduce((suma, modelo) => suma + (modelo.costoUsd ?? 0), 0);
  const parcial = conocidos.length < modelos.length ? " (parcial)" : "";
  return `USD ${total.toFixed(2)}${parcial}`;
}

function miles(n: number): string {
  return new Intl.NumberFormat("es-UY").format(Math.round(n));
}

export function MetricasPanel() {
  const [rango, setRango] = useState<Rango>("30d");
  const { data, error } = useSWR(`/api/board/metricas?rango=${rango}`, traer, {
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

      {error ? (
        <p role="alert" className={styles.error}>No pudimos cargar las métricas.</p>
      ) : !data ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : (
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
            <TarjetaKpi etiqueta="Costo del período" valor={costoTotal(data.agente.modelos)} />
            <TarjetaKpi etiqueta="Latencia mediana" valor={segundos(data.agente.latencia.p50Ms)} />
            <TarjetaKpi etiqueta="Latencia p95" valor={segundos(data.agente.latencia.p95Ms)} />
            <TarjetaKpi
              etiqueta="Mensajes por conversación"
              valor={data.volumen.mensajesPorConversacion.toFixed(1)}
            />
            <TarjetaKpi
              etiqueta="Tasa de abandono"
              valor={porcentaje(data.volumen.tasaAbandono * 100, 100)}
            />
          </div>

          <GraficoBarras
            titulo="Funnel de captación"
            datos={[
              { nombre: "Iniciadas", valor: data.funnel.iniciadas },
              { nombre: "Clasificadas", valor: data.funnel.clasificadas },
              { nombre: "Captadas", valor: data.funnel.captadas },
            ]}
          />

          <section className={styles.bloque}>
            <h2 className={styles.subtitulo}>Casos captados</h2>
            <p className={styles.ayuda}>
              Los consultantes que dejaron cómo contactarlos. Es lo único que un abogado puede accionar.
            </p>
            {data.captados.length === 0 ? (
              <p className={styles.ayuda}>Sin casos captados en este rango.</p>
            ) : (
              <>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th scope="col">Contacto</th>
                      <th scope="col">Teléfono</th>
                      <th scope="col">Email</th>
                      <th scope="col">Último mensaje</th>
                      <th scope="col">Caso</th>
                      <th scope="col">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.captados.map((caso) => (
                      <tr key={caso.id}>
                        <td>{caso.contactoNombre ?? "—"}</td>
                        <td>{caso.contactoTelefono ?? "—"}</td>
                        <td>{caso.contactoEmail ?? "—"}</td>
                        <td>{caso.ultimoMensaje?.slice(0, 10) ?? "—"}</td>
                        {/* El clamp va en un div interno: `display: -webkit-box`
                            sobre el propio td lo saca del layout de la tabla. */}
                        <td className={styles.celdaResumen}>
                          <div className={styles.resumenRecortado}>{caso.situacion ?? "—"}</div>
                        </td>
                        <td>
                          <Link href={`/board/casos/${caso.id}`} className={styles.link}>
                            Ver caso
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* El listado tiene tope: decir cuántos quedaron afuera evita
                    leer una tabla recortada como el total del período. */}
                {data.captados.length < data.funnel.captadas ? (
                  <p className={styles.ayuda}>
                    Mostrando los {data.captados.length} más recientes de {data.funnel.captadas}.
                  </p>
                ) : null}
              </>
            )}
          </section>

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
            titulo="Demanda por subcategoría"
            datos={data.demanda.subcategorias.map((fila) => ({
              nombre: fila.subcategoria,
              valor: fila.casos,
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
            <h2 className={styles.subtitulo}>Consumo por modelo</h2>
            {data.agente.modelos.length === 0 ? (
              <p className={styles.ayuda}>Sin datos en este rango.</p>
            ) : (
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th scope="col">Modelo</th>
                    <th scope="col">Tokens de entrada</th>
                    <th scope="col">Tokens de salida</th>
                    <th scope="col">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agente.modelos.map((modelo) => (
                    <tr key={modelo.modelo}>
                      <td>{modelo.modelo}</td>
                      <td>{miles(modelo.tokensEntrada)}</td>
                      <td>{miles(modelo.tokensSalida)}</td>
                      {/* null = modelo sin precio en la tabla, no costo cero. */}
                      <td>{modelo.costoUsd === null ? "sin dato" : `USD ${modelo.costoUsd.toFixed(2)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className={styles.bloque}>
            <h2 className={styles.subtitulo}>Pedidos fuera de cobertura</h2>
            <p className={styles.ayuda}>
              Lo que consultan y todavía no cubrimos. Entrada directa al roadmap de categorías.
            </p>
            <ul className={styles.lista}>
              {data.demanda.fueraDeCobertura.map((pedido) => (
                <li key={pedido.casoId} className={styles.item}>
                  <span className={styles.fecha}>{pedido.fecha.slice(0, 10)}</span>
                  <span>{pedido.resumen ?? "Sin resumen registrado"}</span>
                  <Link href={`/board/casos/${pedido.casoId}`} className={styles.link}>
                    Ver caso
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}
