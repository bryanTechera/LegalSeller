"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { NotaComposer } from "@/components/revision/NotaComposer";
import { NotasPaginadas } from "@/components/revision/NotasPaginadas";
import { NotaThread } from "@/components/revision/NotaThread";
import { PanelFuentes } from "@/components/revision/PanelFuentes";
import { TextoMarkdown } from "@/components/shared/TextoMarkdown/TextoMarkdown";
import type { DetalleConversacion } from "@/lib/board/conversaciones";
import { resumirTecnico } from "@/lib/board/tecnico";
import { resumirPorRespuesta, textoDeMarca } from "@/lib/revision/fuentes";

import styles from "./chats.module.css";

async function traer(url: string): Promise<DetalleConversacion> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar la conversación");
  return (await response.json()) as DetalleConversacion;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DetalleChat({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/board/conversaciones/${id}`, traer);
  const [anotando, setAnotando] = useState<{ messageId: string | null; cita: string | null } | null>(
    null,
  );
  // Las solapas son el detalle del mensaje elegido. El caso y las notas de la
  // conversación son globales y viven fuera de ellas, siempre a la vista.
  const [solapa, setSolapa] = useState<"fuentes" | "notas">("fuentes");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  // Modo "leer las fuentes": colapsa los bloques de la conversación para que el
  // panel del mensaje se quede con toda la columna.
  const [expandido, setExpandido] = useState(false);

  // try/catch como en SesionView: sin él, una excepción de red (conexión
  // cortada, no un status !== 2xx) sube sin manejar hasta NotaComposer y el
  // `setEnviando(false)` de abajo nunca corre — el botón queda deshabilitado
  // para siempre y el texto tipeado se pierde al recargar.
  const guardarNota = async (texto: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/board/conversaciones/${id}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          ...(anotando?.messageId ? { messageId: anotando.messageId } : {}),
          ...(anotando?.cita ? { citaTexto: anotando.cita } : {}),
        }),
      });
      if (!response.ok) return false;
      setAnotando(null);
      await mutate();
      return true;
    } catch {
      return false;
    }
  };

  const responderNota = async (notaId: string, texto: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/revision/notas/${notaId}/respuestas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!response.ok) return false;
      await mutate();
      return true;
    } catch {
      return false;
    }
  };

  const resolverNota = async (notaId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/revision/notas/${notaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "RESUELTA" }),
      });
      if (!response.ok) return false;
      await mutate();
      return true;
    } catch {
      return false;
    }
  };

  if (error) return <p role="alert" className={styles.error}>No pudimos cargar la conversación.</p>;
  if (isLoading || !data) return <p className={styles.cargando}>Cargando…</p>;

  const resumenes = resumirPorRespuesta(data.busquedas);
  const tecnico = resumirTecnico(data.timeline);

  const mensajes = data.timeline.filter((item) => item.tipo === "mensaje");
  const idsMensajes = new Set(mensajes.map((mensaje) => mensaje.id));
  // Generales + huérfanas (messageId que no matchea el transcript): mismo
  // criterio que SesionView — una nota jamás queda invisible.
  const notasDeLaConversacion = data.notas.filter(
    (nota) => nota.messageId === null || !idsMensajes.has(nota.messageId),
  );
  // Sin selección la lista es vacía a propósito: filtrar por `null` matchearía
  // justo las notas generales y la solapa contaría notas que no muestra.
  const notasDelMensaje =
    seleccionado === null ? [] : data.notas.filter((nota) => nota.messageId === seleccionado);
  const huerfanas = data.busquedas.filter((busqueda) => busqueda.messageId === null).length;
  const anotandoConversacion = anotando !== null && anotando.messageId === null;

  const seleccionar = (messageId: string, destino: "fuentes" | "notas") => {
    setSeleccionado(messageId);
    setSolapa(destino);
  };

  return (
    <section className={styles.detalle}>
      <div>
        <header className={styles.encabezado}>
          <Link href="/board/chats" className={styles.link}>
            ← Chats
          </Link>
          <h1 className={styles.titulo}>{data.categoria ?? "Sin clasificar"}</h1>
          <p className={styles.etiqueta}>{hora(data.fecha)}</p>
        </header>

        {data.intentosExtraccion > 0 && (
          <div className={styles.avisoExtraccion} role="status">
            <h3>Intentos de extracción: {data.intentosExtraccion}</h3>
            <p>
              El filtro de confidencialidad tuvo que redactar la respuesta. Reglas que saltaron:{" "}
              {data.reglasExtraccion.join(", ")}.
            </p>
          </div>
        )}

        <ol className={styles.timeline}>
          {mensajes.map((item) => {
            const resumen = item.rol === "assistant" ? resumenes.get(item.id) : undefined;
            const esSeleccionado = seleccionado === item.id;
            const notas = data.notas.filter((nota) => nota.messageId === item.id).length;
            return (
              <li
                key={item.id}
                className={item.rol === "user" ? styles.mensajeUsuario : styles.mensajeAgente}
                aria-current={esSeleccionado ? "true" : undefined}
                data-seleccionada={esSeleccionado ? "true" : undefined}
              >
                {/* El agente responde en markdown: sin rendirlo, el revisor
                    lee los asteriscos de cada negrita. El mensaje del
                    consultante es texto plano, como en el chat. */}
                {item.rol === "assistant" ? <TextoMarkdown texto={item.texto} /> : <p>{item.texto}</p>}
                <div className={styles.filaMensaje}>
                  {item.rol === "assistant" ? (
                    <button
                      type="button"
                      className={resumen && resumen.vacias > 0 ? styles.marcaAlerta : styles.marca}
                      aria-label={
                        resumen
                          ? `${textoDeMarca(resumen)}: ver fuentes de esta respuesta`
                          : "Sin consultas al corpus: elegir esta respuesta"
                      }
                      onClick={() => seleccionar(item.id, "fuentes")}
                    >
                      {resumen ? textoDeMarca(resumen) : "Sin consultas al corpus"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.botonNota}
                    onClick={() => {
                      setAnotando({ messageId: item.id, cita: item.texto.slice(0, 300) });
                      seleccionar(item.id, "notas");
                    }}
                  >
                    Dejar nota
                  </button>
                  {notas > 0 ? (
                    <button
                      type="button"
                      className={styles.botonNota}
                      aria-label={`Ver ${notas === 1 ? "la nota" : `las ${String(notas)} notas`} de este mensaje`}
                      onClick={() => seleccionar(item.id, "notas")}
                    >
                      {notas === 1 ? "1 nota" : `${String(notas)} notas`}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <aside className={styles.panel}>
        <section className={styles.bloqueFijo} aria-labelledby="board-caso">
          <h2 className={styles.subtitulo} id="board-caso">
            Caso
          </h2>
          {expandido ? null : data.caso ? (
            <dl className={styles.datos}>
              <dt>Estado</dt>
              <dd>{data.caso.estado.replace(/_/g, " ").toLowerCase()}</dd>
              <dt>Categoría</dt>
              <dd>{data.caso.categoria ?? "—"}</dd>
              <dt>Subcategorías</dt>
              <dd>{data.caso.subcategorias.join(", ") || "—"}</dd>
              <dt>Contacto</dt>
              <dd>
                {[data.caso.contactoNombre, data.caso.contactoTelefono, data.caso.contactoEmail]
                  .filter(Boolean)
                  .join(" · ") || "Sin contacto registrado"}
              </dd>
            </dl>
          ) : (
            <p className={styles.etiqueta}>Todavía no se abrió un caso.</p>
          )}
          <details className={styles.tecnico} hidden={expandido}>
            <summary>Detalle técnico</summary>
            <dl className={styles.datos}>
              <dt>Agentes</dt>
              <dd>{tecnico.agentes.join(" · ") || "—"}</dd>
              <dt>Modelos</dt>
              <dd>{tecnico.modelos.join(" · ") || "—"}</dd>
              <dt>Tokens</dt>
              <dd>
                {tecnico.tokensEntrada} entrada / {tecnico.tokensSalida} salida
              </dd>
              <dt>Costo estimado</dt>
              <dd>{tecnico.costoUsd === null ? "sin dato" : `US$ ${tecnico.costoUsd.toFixed(4)}`}</dd>
              <dt>Otras herramientas</dt>
              <dd>
                {tecnico.tools.length === 0
                  ? "—"
                  : tecnico.tools.map((tool) => `${tool.tool}${tool.conError ? " (con error)" : ""}`).join(" · ")}
              </dd>
              {/* Sin el mapa de consultas, una búsqueda sin respuesta asociada
                  no se ve en ningún lado: que al menos quede contada. */}
              {huerfanas > 0 ? (
                <>
                  <dt>Consultas sin respuesta</dt>
                  <dd>{huerfanas}</dd>
                </>
              ) : null}
            </dl>
          </details>
        </section>

        <section className={styles.bloqueFijo} aria-labelledby="board-notas-conversacion">
          <div className={styles.filaTitulo}>
            <h2 className={styles.subtitulo} id="board-notas-conversacion">
              Notas de la conversación
            </h2>
            {expandido ? (
              <span className={styles.etiqueta}>
                {notasDeLaConversacion.length === 0
                  ? "sin notas"
                  : notasDeLaConversacion.length === 1
                    ? "1 nota"
                    : `${String(notasDeLaConversacion.length)} notas`}
              </span>
            ) : (
              <button
                type="button"
                className={styles.botonNota}
                onClick={() => setAnotando({ messageId: null, cita: null })}
              >
                Nota sobre la conversación
              </button>
            )}
          </div>
          {/* El composer sobrevive al colapso a propósito: desmontarlo se
              lleva puesto lo que el revisor venía escribiendo. */}
          {anotandoConversacion ? (
            <NotaComposer cita={null} onCancelar={() => setAnotando(null)} onGuardar={guardarNota} />
          ) : null}
          {expandido ? null : notasDeLaConversacion.length === 0 ? (
            <p className={styles.etiqueta}>Todavía no hay notas sobre la conversación.</p>
          ) : (
            <NotasPaginadas
              notas={notasDeLaConversacion}
              onResponder={responderNota}
              onResolver={resolverNota}
            />
          )}
        </section>

        <div className={styles.filaSolapas}>
          <div className={styles.solapas} role="tablist" aria-label="Detalle del mensaje elegido">
          <button
            type="button"
            role="tab"
            id="solapa-fuentes"
            aria-selected={solapa === "fuentes"}
            aria-controls="panel-mensaje"
            className={solapa === "fuentes" ? styles.solapaActiva : styles.solapa}
            onClick={() => setSolapa("fuentes")}
          >
            Fuentes
          </button>
          <button
            type="button"
            role="tab"
            id="solapa-notas"
            aria-selected={solapa === "notas"}
            aria-controls="panel-mensaje"
            className={solapa === "notas" ? styles.solapaActiva : styles.solapa}
            onClick={() => setSolapa("notas")}
          >
            Notas del mensaje ({notasDelMensaje.length})
            </button>
          </div>
          <button
            type="button"
            className={styles.expandir}
            aria-pressed={expandido}
            onClick={() => setExpandido(!expandido)}
          >
            {expandido ? "Contraer" : "Expandir"}
          </button>
        </div>

        <section
          className={styles.bloqueLateral}
          id="panel-mensaje"
          role="tabpanel"
          aria-labelledby={solapa === "fuentes" ? "solapa-fuentes" : "solapa-notas"}
        >
          {seleccionado !== null ? (
            <button
              type="button"
              className={styles.quitarSeleccion}
              onClick={() => {
                setSeleccionado(null);
                if (!anotandoConversacion) setAnotando(null);
              }}
            >
              Quitar selección
            </button>
          ) : null}
          {solapa === "fuentes" ? (
            <PanelFuentes
              busquedas={data.busquedas}
              messageIdSeleccionado={seleccionado}
              onAnotar={(messageId, cita) => {
                setAnotando({ messageId, cita });
                setSolapa("notas");
              }}
            />
          ) : seleccionado === null ? (
            <p className={styles.etiqueta}>Elegí un mensaje para ver o dejar notas sobre él.</p>
          ) : (
            <>
              {anotando !== null && anotando.messageId === seleccionado ? (
                <NotaComposer cita={anotando.cita} onCancelar={() => setAnotando(null)} onGuardar={guardarNota} />
              ) : (
                <button
                  type="button"
                  className={styles.botonNota}
                  onClick={() => setAnotando({ messageId: seleccionado, cita: null })}
                >
                  Nota sobre este mensaje
                </button>
              )}
              {notasDelMensaje.length === 0 ? (
                <p className={styles.etiqueta}>Este mensaje todavía no tiene notas.</p>
              ) : (
                notasDelMensaje.map((nota) => (
                  <NotaThread key={nota.id} nota={nota} onResponder={responderNota} onResolver={resolverNota} />
                ))
              )}
            </>
          )}
        </section>
      </aside>
    </section>
  );
}
