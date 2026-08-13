"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { DetalleCaso as Caso } from "@/lib/casos/caso-detalle";

import styles from "./casos.module.css";
import { etiquetaGestion } from "./gestiones";
import { ModalGestion } from "./ModalGestion";

async function traer(url: string): Promise<Caso> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar el caso");
  return (await response.json()) as Caso;
}

// El board se lee desde Uruguay; sin timeZone explícito, JS formatea con la
// zona del proceso (UTC en Railway) y todo horario queda corrido.
function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DetalleCaso({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/board/casos/${id}`, traer);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  // Una nota que se pierde en silencio es peor que un error visible: sin
  // esto el abogado no tiene forma de saber si lo que tipeó quedó guardado.
  const [errorNota, setErrorNota] = useState(false);
  const [errorRegenerar, setErrorRegenerar] = useState(false);

  // La respuesta del PATCH que trae el modal ya es la gestión vigente: un
  // mutate() sin argumentos revalidaría el caso entero (obtenerCaso ->
  // asegurarSintesis -> construirTimeline sobre todo el thread) para
  // actualizar un badge del encabezado.
  const alGuardarGestion = (gestion: Caso["gestion"]) => {
    void mutate((previo) => (previo ? { ...previo, gestion } : previo), { revalidate: false });
  };

  const agregarNota = async () => {
    if (texto.trim() === "") return;
    setGuardando(true);
    try {
      const response = await fetch(`/api/board/casos/${id}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (response.ok) {
        setTexto("");
        setErrorNota(false);
        await mutate();
      } else {
        setErrorNota(true);
      }
    } catch {
      // El botón se rehabilita en el finally: sin él queda muerto y se pierde
      // lo tipeado.
      setErrorNota(true);
    } finally {
      setGuardando(false);
    }
  };

  const regenerar = async () => {
    setRegenerando(true);
    try {
      const response = await fetch(`/api/board/casos/${id}/sintesis`, { method: "POST" });
      if (response.ok) {
        setErrorRegenerar(false);
        await mutate();
      } else {
        setErrorRegenerar(true);
      }
    } catch {
      setErrorRegenerar(true);
    } finally {
      setRegenerando(false);
    }
  };

  if (error) return <p role="alert" className={styles.error}>No pudimos cargar el caso.</p>;
  if (isLoading || !data) return <p className={styles.cargando}>Cargando…</p>;

  const sintesis = data.sintesis.estado === "sin-sintesis" ? null : data.sintesis.sintesis;
  const desactualizada = data.sintesis.estado === "ok" && !data.sintesis.vigente;

  return (
    <section className={styles.caso}>
      <header className={styles.encabezado}>
        <Link href="/board/casos" className={styles.link}>← Casos</Link>
        <div className={styles.filaEncabezado}>
          <h1 className={styles.titulo}>{data.categoria ?? "Pedido fuera de cobertura"}</h1>
          {/* El badge dice "Gestión:" porque al lado convive el estado que dejó
              el agente ("captado"): son dos ejes distintos y una píldora suelta
              con "Contactado" se lee como si fueran el mismo. */}
          <span className={styles.badgeGestion}>Gestión: {etiquetaGestion(data.gestion.estado)}</span>
        </div>
        <p className={styles.etiqueta}>
          {data.subcategorias.join(" · ") || "sin subcategorías"} — {data.estado.replace(/_/g, " ").toLowerCase()}
        </p>
        {data.gestion.por && data.gestion.en ? (
          <p className={styles.etiqueta}>Marcado por {data.gestion.por} · {fecha(data.gestion.en)}</p>
        ) : null}
        <p className={styles.etiqueta}>
          Abierto el {fecha(data.creadoEn)} · última actividad {fecha(data.actualizadoEn)}
        </p>
      </header>

      <div className={styles.columnas}>
        <div className={styles.principal}>
          <section className={styles.resumen} aria-labelledby="caso-resumen">
            <div className={styles.filaTitulo}>
              <h2 className={styles.subtitulo} id="caso-resumen">Resumen del caso</h2>
              <button type="button" className={styles.boton} onClick={regenerar} disabled={regenerando}>
                {regenerando ? "Regenerando…" : "Regenerar"}
              </button>
            </div>

            {errorRegenerar ? (
              <p role="status" className={styles.aviso}>No pudimos regenerar el resumen.</p>
            ) : null}

            {data.sintesis.estado === "error" ? (
              <p role="status" className={styles.aviso}>
                No pudimos generar el resumen. {sintesis ? "Abajo está el último que se generó." : "Podés reintentar o leer el chat."}
              </p>
            ) : desactualizada ? (
              <p role="status" className={styles.aviso}>
                El resumen quedó desactualizado respecto de la conversación.
              </p>
            ) : null}

            {sintesis === null ? (
              <p className={styles.etiqueta}>Todavía no hay resumen de este caso.</p>
            ) : (
              <>
                <p className={styles.situacion}>{sintesis.situacion}</p>

                {sintesis.hechos.length > 0 ? (
                  <>
                    <h3 className={styles.tituloBloque}>Qué pasó</h3>
                    <ul className={styles.hechos}>
                      {sintesis.hechos.map((hecho, indice) => (
                        <li key={`${hecho.que}-${String(indice)}`}>
                          {hecho.cuando ? <span className={styles.fecha}>{hecho.cuando}</span> : null}
                          <span>{hecho.que}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {sintesis.datosClave.length > 0 ? (
                  <>
                    <h3 className={styles.tituloBloque}>Datos del caso</h3>
                    <dl className={styles.datosSintesis}>
                      {/* La key lleva el índice: la etiqueta la escribe el modelo y puede repetirse. */}
                      {sintesis.datosClave.map((dato, indice) => (
                        <div key={`${dato.etiqueta}-${String(indice)}`}>
                          <dt>{dato.etiqueta}</dt>
                          <dd>{dato.valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : null}

                <h3 className={styles.tituloBloque}>Qué pide</h3>
                <p>{sintesis.pedido}</p>

                {sintesis.faltantes.length > 0 ? (
                  <>
                    <h3 className={styles.tituloBloque}>Falta averiguar</h3>
                    <ul className={styles.faltantes}>
                      {sintesis.faltantes.map((faltante, indice) => (
                        <li key={`${faltante}-${String(indice)}`}>{faltante}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {data.sintesis.estado !== "sin-sintesis" && data.sintesis.generadaEn ? (
                  <p className={styles.etiqueta}>Generado el {fecha(data.sintesis.generadaEn)}</p>
                ) : null}
              </>
            )}
          </section>

          <p className={styles.verificacion}>
            <Link href={`/board/chats/${data.conversationId}`} className={styles.link}>
              Ver chat completo
            </Link>{" "}
            — para verificar cualquier dato del resumen contra lo que dijo la persona.
          </p>
        </div>

        <aside className={styles.lateral}>
          <section className={styles.bloque} aria-labelledby="caso-contacto">
            <h2 className={styles.subtitulo} id="caso-contacto">Contacto</h2>
            <dl className={styles.datos}>
              <div>
                <dt>Nombre</dt>
                <dd>{data.contactoNombre ?? "—"}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{data.contactoTelefono ? <a href={`tel:${data.contactoTelefono}`}>{data.contactoTelefono}</a> : "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{data.contactoEmail ? <a href={`mailto:${data.contactoEmail}`}>{data.contactoEmail}</a> : "—"}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.bloque} aria-labelledby="caso-notas">
            <h2 className={styles.subtitulo} id="caso-notas">Notas del equipo legal</h2>
            <p className={styles.ayuda}>
              Lo que averiguaron por fuera del chat — por ejemplo hablando con la persona.
            </p>
            <div className={styles.composer}>
              <label className={styles.etiqueta} htmlFor="nota-caso">Nueva nota</label>
              <textarea
                id="nota-caso"
                className={styles.textarea}
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                rows={3}
              />
              <button type="button" className={styles.boton} onClick={agregarNota} disabled={guardando || texto.trim() === ""}>
                {guardando ? "Guardando…" : "Agregar nota"}
              </button>
              {errorNota ? (
                <p role="status" className={styles.aviso}>No pudimos guardar la nota. Probá de nuevo.</p>
              ) : null}
            </div>
            {data.notas.length === 0 ? (
              <p className={styles.etiqueta}>Todavía no hay notas sobre este caso.</p>
            ) : (
              <ul className={styles.notas}>
                {data.notas.map((nota) => (
                  <li key={nota.id} className={styles.nota}>
                    <p className={styles.etiqueta}>{nota.autor} · {fecha(nota.createdAt)}</p>
                    <p>{nota.texto}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <ModalGestion casoId={id} gestion={data.gestion} onGuardado={alGuardarGestion} />
    </section>
  );
}
