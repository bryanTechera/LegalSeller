"use client";

import { useRef, useState } from "react";

import { Composer } from "@/components/chat/Composer";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useRevisionChat } from "@/hooks/useRevisionChat";
import type { NotaConRespuestas } from "@/lib/revision/notas";
import { citaDesdeSeleccion } from "@/lib/revision/seleccion";

import { NotaComposer } from "./NotaComposer";
import { NotaThread } from "./NotaThread";
import styles from "./revision.module.css";

const MAX_MESSAGE_LENGTH = 4000;

interface ComposerAbierto {
  messageId: string | null;
  cita: string | null;
}

interface PillSeleccion {
  messageId: string;
  cita: string;
  x: number;
  y: number;
}

export function SesionView({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { detalle, isStreaming, pendienteUsuario, textoStreaming, error, sendMessage, refetch } = useRevisionChat(id);
  const [draft, setDraft] = useState("");
  const [composerAbierto, setComposerAbierto] = useState<ComposerAbierto | null>(null);
  const [pill, setPill] = useState<PillSeleccion | null>(null);
  const chatRef = useRef<HTMLElement>(null);

  const enviar = () => {
    if (isStreaming || !draft.trim()) return;
    void sendMessage(draft);
    setDraft("");
  };

  const abrirComposer = (messageId: string | null, cita: string | null) => {
    setComposerAbierto({ messageId, cita });
    setPill(null);
  };

  // Pill "Dejar nota" al soltar una selección contenida en un solo mensaje.
  const handleMouseUp = () => {
    const seleccion = window.getSelection();
    const contenedor = chatRef.current;
    if (!seleccion || seleccion.rangeCount === 0 || !contenedor) {
      setPill(null);
      return;
    }
    const ancla = citaDesdeSeleccion(seleccion, contenedor);
    if (!ancla) {
      setPill(null);
      return;
    }
    const rect = seleccion.getRangeAt(0).getBoundingClientRect();
    const marco = contenedor.getBoundingClientRect();
    setPill({ ...ancla, x: rect.left - marco.left + rect.width / 2, y: rect.bottom - marco.top + 6 });
  };

  const crearNota = async (texto: string): Promise<boolean> => {
    if (!composerAbierto) return false;
    try {
      const response = await fetch(`/api/revision/sesiones/${id}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          ...(composerAbierto.messageId ? { messageId: composerAbierto.messageId } : {}),
          ...(composerAbierto.cita ? { citaTexto: composerAbierto.cita.slice(0, 2000) } : {}),
        }),
      });
      if (!response.ok) return false;
      setComposerAbierto(null);
      await refetch();
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
      await refetch();
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
      await refetch();
      return true;
    } catch {
      return false;
    }
  };

  const mensajes = (detalle?.timeline ?? []).filter((item) => item.tipo === "mensaje");
  const notas = detalle?.notas ?? [];
  const idsMensajes = new Set(mensajes.map((mensaje) => mensaje.id));
  const notasDeMensaje = (messageId: string): NotaConRespuestas[] => notas.filter((nota) => nota.messageId === messageId);
  // Generales + huérfanas (messageId que no matchea el transcript): una nota jamás queda invisible.
  const notasGenerales = notas.filter((nota) => nota.messageId === null || !idsMensajes.has(nota.messageId));
  const composerGeneralAbierto = composerAbierto !== null && composerAbierto.messageId === null;

  return (
    <div>
      <header className={styles.sesionHeader}>
        <div>
          <h1 className={styles.titulo}>{detalle?.sesion.titulo ?? "Sesión de revisión"}</h1>
          <p className={styles.sesionMeta}>Creada por {detalle?.sesion.creadaPor ?? "—"}</p>
        </div>
        <div className={styles.sesionAcciones}>
          <button type="button" className={styles.botonSecundario} onClick={() => abrirComposer(null, null)}>
            Nota general
          </button>
          <button type="button" className={styles.botonSecundario} onClick={onVolver}>
            Volver al listado
          </button>
        </div>
      </header>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}

      {notasGenerales.length > 0 || composerGeneralAbierto ? (
        <section className={styles.notasGenerales} aria-label="Notas generales">
          <h2 className={styles.seccionTitulo}>Notas generales</h2>
          {notasGenerales.map((nota) => (
            <NotaThread key={nota.id} nota={nota} onResponder={responderNota} onResolver={resolverNota} />
          ))}
          {composerGeneralAbierto ? (
            <NotaComposer cita={null} onCancelar={() => setComposerAbierto(null)} onGuardar={crearNota} />
          ) : null}
        </section>
      ) : null}

      <section aria-label="Conversación de prueba" className={styles.chatColumna} ref={chatRef} onMouseUp={handleMouseUp}>
        {mensajes.map((mensaje) => (
          <div key={mensaje.id} className={styles.bloqueMensaje}>
            <div className={styles.mensajeConGutter}>
              <MessageBubble role={mensaje.rol} content={mensaje.texto} anchorId={mensaje.id} />
              <button
                type="button"
                className={styles.botonAnotar}
                onClick={() => abrirComposer(mensaje.id, null)}
                aria-label="Dejar nota en este mensaje"
              >
                +
              </button>
            </div>
            {notasDeMensaje(mensaje.id).map((nota) => (
              <NotaThread key={nota.id} nota={nota} onResponder={responderNota} onResolver={resolverNota} />
            ))}
            {composerAbierto?.messageId === mensaje.id ? (
              <NotaComposer
                cita={composerAbierto.cita}
                onCancelar={() => setComposerAbierto(null)}
                onGuardar={crearNota}
              />
            ) : null}
          </div>
        ))}
        {pendienteUsuario ? <MessageBubble role="user" content={pendienteUsuario} /> : null}
        {textoStreaming !== null ? (
          <MessageBubble role="assistant" content={textoStreaming} showThinking={textoStreaming.length === 0} />
        ) : null}
        {pill ? (
          <button
            type="button"
            className={styles.pillSeleccion}
            style={{ left: pill.x, top: pill.y }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              abrirComposer(pill.messageId, pill.cita);
              window.getSelection()?.removeAllRanges();
            }}
          >
            Dejar nota
          </button>
        ) : null}
      </section>

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={enviar}
        isStreaming={isStreaming}
        placeholder="Probá al asistente como si fueras un consultante…"
        label="Mensaje de prueba"
        inputId="revision-input"
        maxLength={MAX_MESSAGE_LENGTH}
      />
    </div>
  );
}
