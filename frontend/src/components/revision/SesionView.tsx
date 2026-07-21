"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useRevisionChat } from "@/hooks/useRevisionChat";

import { NotaThread } from "./NotaThread";
import styles from "./revision.module.css";

export function SesionView({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { detalle, isStreaming, pendienteUsuario, textoStreaming, error, sendMessage, refetch } = useRevisionChat(id);
  const [draft, setDraft] = useState("");
  const [notaPara, setNotaPara] = useState<{ messageId: string | null; cita: string | null } | null>(null);
  const [textoNota, setTextoNota] = useState("");

  const crearNota = async () => {
    if (!notaPara || !textoNota.trim()) return;
    const response = await fetch(`/api/revision/sesiones/${id}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: textoNota.trim(),
        ...(notaPara.messageId ? { messageId: notaPara.messageId } : {}),
        ...(notaPara.cita ? { citaTexto: notaPara.cita.slice(0, 2000) } : {}),
      }),
    });
    if (response.ok) {
      setNotaPara(null);
      setTextoNota("");
      await refetch();
    }
  };

  const responderNota = async (notaId: string, texto: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}/respuestas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    }).catch(() => null);
    if (!response?.ok) return false;
    await refetch();
    return true;
  };

  const resolverNota = async (notaId: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "RESUELTA" }),
    }).catch(() => null);
    if (!response?.ok) return false;
    await refetch();
    return true;
  };

  const mensajes = (detalle?.timeline ?? []).filter((item) => item.tipo === "mensaje");
  const notasDeMensaje = (messageId: string) => (detalle?.notas ?? []).filter((nota) => nota.messageId === messageId);

  return (
    <div>
      <header className={styles.encabezado}>
        <div>
          <h1 className={styles.titulo}>{detalle?.sesion.titulo ?? "Sesión de revisión"}</h1>
          <p className={styles.subtitulo}>Creada por {detalle?.sesion.creadaPor ?? "—"}</p>
        </div>
        <button type="button" className={styles.botonSecundario} onClick={onVolver}>
          Volver al listado
        </button>
      </header>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.sesionLayout}>
        <section aria-label="Conversación de prueba" className={styles.chatColumna}>
          {mensajes.map((mensaje) => (
            <article key={mensaje.id} className={mensaje.rol === "user" ? styles.mensajeUsuario : styles.mensajeAsistente}>
              {mensaje.rol === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{mensaje.texto}</ReactMarkdown>
              ) : (
                <p>{mensaje.texto}</p>
              )}
              <div className={styles.accionesMensaje}>
                {notasDeMensaje(mensaje.id).length > 0 ? (
                  <span className={styles.marcadorNota}>{notasDeMensaje(mensaje.id).length} nota(s)</span>
                ) : null}{" "}
                <button
                  type="button"
                  className={styles.botonNota}
                  onClick={() => setNotaPara({ messageId: mensaje.id, cita: mensaje.texto.slice(0, 300) })}
                >
                  Dejar nota
                </button>
              </div>
            </article>
          ))}
          {pendienteUsuario ? (
            <article className={styles.mensajeUsuario}><p>{pendienteUsuario}</p></article>
          ) : null}
          {textoStreaming !== null ? (
            <article className={styles.mensajeAsistente}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textoStreaming}</ReactMarkdown>
            </article>
          ) : null}
          {notaPara ? (
            <div className={styles.formNota}>
              {notaPara.cita ? <p className={styles.notaCita}>“{notaPara.cita}”</p> : null}
              <textarea
                value={textoNota}
                placeholder="¿Qué observaste en esta respuesta?"
                onChange={(event) => setTextoNota(event.target.value)}
                aria-label="Texto de la nota"
              />
              <div className={styles.filaBotones}>
                <button type="button" className={styles.botonSecundario} onClick={() => setNotaPara(null)}>
                  Cancelar
                </button>
                <button type="button" className={styles.botonPrimario} disabled={!textoNota.trim()} onClick={() => void crearNota()}>
                  Guardar nota
                </button>
              </div>
            </div>
          ) : null}
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
              setDraft("");
            }}
          >
            <textarea
              value={draft}
              placeholder="Probá al asistente como si fueras un consultante…"
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Mensaje de prueba"
            />
            <button type="submit" className={styles.botonPrimario} disabled={isStreaming || !draft.trim()}>
              Enviar
            </button>
          </form>
        </section>
        <aside aria-label="Notas de la sesión" className={styles.panelNotas}>
          <div className={styles.filaBotones}>
            <button type="button" className={styles.botonNota} onClick={() => setNotaPara({ messageId: null, cita: null })}>
              Nota general de la sesión
            </button>
          </div>
          {(detalle?.notas ?? []).length === 0 ? <p className={styles.subtitulo}>Sin notas todavía.</p> : null}
          {(detalle?.notas ?? []).map((nota) => (
            <NotaThread key={nota.id} nota={nota} onResponder={responderNota} onResolver={resolverNota} />
          ))}
        </aside>
      </div>
    </div>
  );
}
