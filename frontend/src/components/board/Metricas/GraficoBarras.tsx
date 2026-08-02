"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import styles from "./metricas.module.css";

export interface PuntoGrafico {
  nombre: string;
  valor: number;
}

export function GraficoBarras({ titulo, datos }: { titulo: string; datos: PuntoGrafico[] }) {
  return (
    <section className={styles.bloque}>
      <h2 className={styles.subtitulo}>{titulo}</h2>
      {datos.length === 0 ? (
        <p className={styles.ayuda}>Sin datos en este rango.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={datos}>
            <CartesianGrid stroke="#e2e8ee" vertical={false} />
            <XAxis dataKey="nombre" stroke="#64778a" fontSize={13} />
            <YAxis stroke="#64778a" fontSize={13} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="valor" fill="#3185c9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
