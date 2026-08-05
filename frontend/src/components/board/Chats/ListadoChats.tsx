"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { ChatResumen, PaginaChats } from "@/lib/board/conversaciones";
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

interface Filtros {
  rango: Rango;
  estado: string;
  categoria: string;
  consulta: string;
}

function construirParametros({ rango, estado, categoria, consulta }: Filtros): URLSearchParams {
  const params = new URLSearchParams({ rango });
  if (estado) params.set("estado", estado);
  if (categoria) params.set("categoria", categoria);
  if (consulta.length >= 2) params.set("busqueda", consulta);
  return params;
}

/**
 * Una página más allá de la que maneja SWR, atada a la firma de filtros que
 * la produjo. En vez de resetear el acumulado a mano cuando cambia un
 * filtro, el render se queda solo con las páginas cuya firma coincide con la
 * vigente — una respuesta que resuelve después de que el usuario ya cambió
 * de filtro queda afuera sola, sin cancelarla ni compararla contra una ref.
 */
interface PaginaExtra {
  firma: string;
  chats: ChatResumen[];
  cursor: string | null;
}

export function ListadoChats() {
  const [rango, setRango] = useState<Rango>("30d");
  const [estado, setEstado] = useState<string>("");
  const [categoria, setCategoria] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [consulta, setConsulta] = useState("");

  const params = construirParametros({ rango, estado, categoria, consulta });
  const firmaFiltros = params.toString();

  const { data, error, isLoading } = useSWR(
    `/api/board/conversaciones?${firmaFiltros}`,
    traer,
    { dedupingInterval: 15_000 },
  );

  const [paginasExtra, setPaginasExtra] = useState<PaginaExtra[]>([]);
  const [cargandoMas, setCargandoMas] = useState(false);

  const paginasVigentes = paginasExtra.filter((pagina) => pagina.firma === firmaFiltros);
  const chats = [...(data?.chats ?? []), ...paginasVigentes.flatMap((pagina) => pagina.chats)];
  const ultimaVigente = paginasVigentes[paginasVigentes.length - 1];
  const cursor = ultimaVigente ? ultimaVigente.cursor : (data?.cursor ?? null);

  // El select de categoría no tiene un endpoint propio para el browser:
  // dominios.ts es server-only (pensado para el BFF), y el browser nunca le
  // habla directo al backend Mastra — pedirlo requeriría un endpoint nuevo.
  // Se deriva de lo ya cargado en este render: si hay un filtro de categoría
  // activo, el select temporalmente solo la muestra a ella hasta volver a
  // "Todas" (limitación conocida, preferible a inventar un endpoint).
  const categoriasVistas = [
    ...new Set(chats.map((chat) => chat.categoria).filter((valor): valor is string => Boolean(valor))),
  ].sort();

  async function cargarMas() {
    if (!cursor || cargandoMas) return;
    const firmaAlPedir = firmaFiltros;
    setCargandoMas(true);
    try {
      const siguientes = new URLSearchParams(params);
      siguientes.set("cursor", cursor);
      const pagina = await traer(`/api/board/conversaciones?${siguientes.toString()}`);
      setPaginasExtra((previas) => [
        ...previas,
        { firma: firmaAlPedir, chats: pagina.chats, cursor: pagina.cursor },
      ]);
    } finally {
      setCargandoMas(false);
    }
  }

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
            <span className={styles.etiqueta}>Categoría</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categoriasVistas.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
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
      ) : chats.length === 0 ? (
        <p className={styles.cargando}>No hay conversaciones en este rango.</p>
      ) : (
        <>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th scope="col">Última actividad</th>
                <th scope="col">Categoría</th>
                <th scope="col">Estado</th>
                <th scope="col">Casos</th>
                <th scope="col">Mensajes</th>
                <th scope="col">Consulta</th>
                <th scope="col">Notas</th>
              </tr>
            </thead>
            <tbody>
              {chats.map((chat) => {
                const actividad = fechaCorta(chat.ultimaActividad);
                const creacion = fechaCorta(chat.fecha);
                return (
                  <tr key={chat.id}>
                    <td>
                      {actividad}
                      {/* La creación solo se muestra cuando difiere de día: es
                          el dato que explica por qué un chat "viejo" sigue
                          arriba del listado (ver Task 9: el orden es por
                          actividad, no por creación). */}
                      {creacion !== actividad ? (
                        <span className={styles.etiqueta}> · creado {creacion}</span>
                      ) : null}
                    </td>
                    <td>{chat.categoria ?? "—"}</td>
                    <td>{chat.estadoCaso?.replace(/_/g, " ").toLowerCase() ?? "—"}</td>
                    <td>{chat.casos}</td>
                    <td>{chat.mensajes}</td>
                    <td>
                      <Link href={`/board/chats/${chat.id}`} className={styles.link}>
                        {chat.preview || "Sin mensajes"}
                      </Link>
                    </td>
                    <td>{chat.notas > 0 ? chat.notas : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className={styles.paginacion}>
            <p className={styles.contador}>
              {cursor
                ? `${chats.length} conversaciones cargadas — hay más.`
                : `${chats.length} conversaciones en total.`}
            </p>
            {cursor ? (
              <button
                type="button"
                className={styles.boton}
                onClick={() => void cargarMas()}
                disabled={cargandoMas}
              >
                {cargandoMas ? "Cargando…" : "Cargar más"}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
