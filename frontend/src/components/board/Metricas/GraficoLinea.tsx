"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { PuntoGrafico } from "./GraficoBarras";
import styles from "./metricas.module.css";

export function GraficoLinea({ titulo, datos }: { titulo: string; datos: PuntoGrafico[] }) {
  return (
    <section className={styles.bloque}>
      <h2 className={styles.subtitulo}>{titulo}</h2>
      {datos.length === 0 ? (
        <p className={styles.ayuda}>Sin datos en este rango.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={datos}>
            <CartesianGrid stroke="#e2e8ee" vertical={false} />
            <XAxis dataKey="nombre" stroke="#64778a" fontSize={13} />
            <YAxis stroke="#64778a" fontSize={13} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="valor" stroke="#3185c9" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
