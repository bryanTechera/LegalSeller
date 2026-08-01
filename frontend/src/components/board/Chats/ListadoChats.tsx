"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { PaginaChats } from "@/lib/board/conversaciones";
import type { Rango } from "@/lib/board/rango";

import styles from "./chats.module.css";

const ESTADOS = ["EN_CONVERSACION", "CAPTADO", "FUERA_DE_COBERTURA"] as const;

/** El board se lee desde Uruguay; slice(0,10) sobre el ISO mostraría el día UTC. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", { timeZone: "America/Montevideo" });
}

async function traer(url: string): Promise<PaginaChats> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar los chats");
  return (await response.json()) as PaginaChats;
}

export function ListadoChats() {
  const [rango, setRango] = useState<Rango>("30d");
  const [estado, setEstado] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");

  const params = new URLSearchParams({ rango });
  if (estado) params.set("estado", estado);
  if (consulta.length >= 2) params.set("busqueda", consulta);

  const { data, error, isLoading } = useSWR(
    `/api/board/conversaciones?${params.toString()}`,
    traer,
    { dedupingInterval: 15_000 },
  );

  return (
    <section>
      <header className={styles.encabezado}>
        <h1 className={styles.titulo}>Chats</h1>
        <form
          className={styles.filtros}
          onSubmit={(evento) => {
            evento.preventDefault();
            setConsulta(busqueda.trim());
          }}
        >
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Rango</span>
            <select value={rango} onChange={(e) => setRango(e.target.value as Rango)}>
              <option value="7d">7 días</option>
              <option value="30d">30 días</option>
              <option value="90d">90 días</option>
              <option value="todo">Todo</option>
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((valor) => (
                <option key={valor} value={valor}>
                  {valor.replace(/_/g, " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Buscar</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Texto en los mensajes"
            />
          </label>
          <button type="submit" className={styles.boton}>
            Buscar
          </button>
        </form>
      </header>

      {error ? <p role="alert" className={styles.error}>No pudimos cargar los chats.</p> : null}
      {isLoading || !data ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : data.chats.length === 0 ? (
        <p className={styles.cargando}>No hay conversaciones en este rango.</p>
      ) : (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Categoría</th>
              <th scope="col">Estado</th>
              <th scope="col">Mensajes</th>
              <th scope="col">Consulta</th>
              <th scope="col">Notas</th>
            </tr>
          </thead>
          <tbody>
            {data.chats.map((chat) => (
              <tr key={chat.id}>
                <td>{fechaCorta(chat.fecha)}</td>
                <td>{chat.categoria ?? "—"}</td>
                <td>{chat.estadoCaso?.replace(/_/g, " ").toLowerCase() ?? "—"}</td>
                <td>{chat.mensajes}</td>
                <td>
                  <Link href={`/board/chats/${chat.id}`} className={styles.link}>
                    {chat.preview || "Sin mensajes"}
                  </Link>
                </td>
                <td>{chat.notas > 0 ? chat.notas : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
