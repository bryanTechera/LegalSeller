"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { CasoResumen, PaginaCasos } from "@/lib/board/casos";
import type { Rango } from "@/lib/board/rango";

import styles from "./casos.module.css";

const GESTIONES = ["NUEVO", "CONTACTADO", "DERIVADO", "DESCARTADO"] as const;
const ESTADOS = ["EN_CONVERSACION", "CAPTADO", "FUERA_DE_COBERTURA"] as const;

/** El board se lee desde Uruguay; slice(0,10) sobre el ISO mostraría el día UTC. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", { timeZone: "America/Montevideo" });
}

function legible(valor: string): string {
  return valor.replace(/_/g, " ").toLowerCase();
}

/**
 * Versión capitalizada para las opciones de los selects de filtro: el badge
 * de gestión en la tabla también muestra el valor en minúsculas ("nuevo"), y
 * un <option> queda en el DOM aunque el select esté cerrado — sin esta
 * distinción, "nuevo" aparece dos veces y deja de ser un texto único.
 */
function capitalizado(valor: string): string {
  const texto = legible(valor);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

async function traer(url: string): Promise<PaginaCasos> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar los casos");
  return (await response.json()) as PaginaCasos;
}

interface Filtros {
  rango: Rango;
  gestion: string;
  estado: string;
  categoria: string;
  contacto: string;
}

function construirParametros({ rango, gestion, estado, categoria, contacto }: Filtros): URLSearchParams {
  const params = new URLSearchParams({ rango });
  if (gestion) params.set("gestion", gestion);
  if (estado) params.set("estado", estado);
  if (categoria) params.set("categoria", categoria);
  if (contacto.length >= 2) params.set("contacto", contacto);
  return params;
}

/**
 * Una página más allá de la que maneja SWR, atada a la firma de filtros que la
 * produjo: una respuesta que resuelve después de que el usuario ya cambió de
 * filtro queda afuera sola, sin cancelarla ni compararla contra una ref.
 * Mismo mecanismo que `ListadoChats`.
 */
interface PaginaExtra {
  firma: string;
  casos: CasoResumen[];
  cursor: string | null;
}

export function ListadoCasos() {
  const [rango, setRango] = useState<Rango>("30d");
  const [gestion, setGestion] = useState<string>("");
  // Abre por los leads accionables; el resto está a un select de distancia.
  const [estado, setEstado] = useState<string>("CAPTADO");
  const [categoria, setCategoria] = useState<string>("");
  const [contacto, setContacto] = useState("");
  const [consulta, setConsulta] = useState("");

  const params = construirParametros({ rango, gestion, estado, categoria, contacto: consulta });
  const firmaFiltros = params.toString();

  const { data, error, isLoading } = useSWR(`/api/board/casos?${firmaFiltros}`, traer, {
    dedupingInterval: 15_000,
  });

  const [paginasExtra, setPaginasExtra] = useState<PaginaExtra[]>([]);
  const [cargandoMas, setCargandoMas] = useState(false);

  const paginasVigentes = paginasExtra.filter((pagina) => pagina.firma === firmaFiltros);
  const casos = [...(data?.casos ?? []), ...paginasVigentes.flatMap((pagina) => pagina.casos)];
  const ultimaVigente = paginasVigentes[paginasVigentes.length - 1];
  const cursor = ultimaVigente ? ultimaVigente.cursor : (data?.cursor ?? null);

  // Mismo criterio que ListadoChats: el select se deriva de lo cargado en este
  // render, porque el catálogo de categorías es server-only y el browser nunca
  // le habla directo al backend.
  const categoriasVistas = [
    ...new Set(casos.map((caso) => caso.categoria).filter((valor): valor is string => Boolean(valor))),
  ].sort();

  async function cargarMas() {
    if (!cursor || cargandoMas) return;
    const firmaAlPedir = firmaFiltros;
    setCargandoMas(true);
    try {
      const siguientes = new URLSearchParams(params);
      siguientes.set("cursor", cursor);
      const pagina = await traer(`/api/board/casos?${siguientes.toString()}`);
      setPaginasExtra((previas) => [
        ...previas,
        { firma: firmaAlPedir, casos: pagina.casos, cursor: pagina.cursor },
      ]);
    } finally {
      setCargandoMas(false);
    }
  }

  return (
    <section>
      <header className={styles.encabezado}>
        <h1 className={styles.titulo}>Casos</h1>
        <form
          className={styles.filtros}
          onSubmit={(evento) => {
            evento.preventDefault();
            setConsulta(contacto.trim());
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
            <span className={styles.etiqueta}>Gestión</span>
            <select value={gestion} onChange={(e) => setGestion(e.target.value)}>
              <option value="">Todas</option>
              {GESTIONES.map((valor) => (
                <option key={valor} value={valor}>
                  {capitalizado(valor)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((valor) => (
                <option key={valor} value={valor}>
                  {capitalizado(valor)}
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
            <span className={styles.etiqueta}>Contacto</span>
            <input
              type="search"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Nombre, teléfono o mail"
            />
          </label>
          <button type="submit" className={styles.boton}>
            Buscar
          </button>
        </form>
      </header>

      {error ? <p role="alert" className={styles.error}>No pudimos cargar los casos.</p> : null}
      {isLoading || !data ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : casos.length === 0 ? (
        <p className={styles.cargando}>No hay casos con estos filtros.</p>
      ) : (
        <>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th scope="col">Última actividad</th>
                <th scope="col">Gestión</th>
                <th scope="col">Estado</th>
                <th scope="col">Categoría</th>
                <th scope="col">Contacto</th>
                <th scope="col">Situación</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((caso) => (
                <tr key={caso.id}>
                  <td>{fechaCorta(caso.ultimaActividad)}</td>
                  <td>
                    <span className={styles.badge}>{legible(caso.gestion)}</span>
                  </td>
                  <td>{legible(caso.estado)}</td>
                  <td>{caso.categoria ?? "—"}</td>
                  <td>
                    {caso.contactoNombre ?? "—"}
                    {caso.contactoTelefono ? (
                      <span className={styles.etiqueta}> · {caso.contactoTelefono}</span>
                    ) : null}
                  </td>
                  <td>
                    <Link href={`/board/casos/${caso.id}`} className={styles.link}>
                      {caso.situacion ?? "Ver el caso"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.paginacion}>
            <p className={styles.contador}>
              {cursor ? `${casos.length} casos cargados — hay más.` : `${casos.length} casos en total.`}
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
