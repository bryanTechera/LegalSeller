"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { NotaComposer } from "@/components/revision/NotaComposer";
import { NotaThread } from "@/components/revision/NotaThread";
import type { DetalleConversacion } from "@/lib/board/conversaciones";

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

  const guardarNota = async (texto: string): Promise<boolean> => {
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
  };

  const responderNota = async (notaId: string, texto: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}/respuestas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!response.ok) return false;
    await mutate();
    return true;
  };

  const resolverNota = async (notaId: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "RESUELTA" }),
    });
    if (!response.ok) return false;
    await mutate();
    return true;
  };

  if (error) return <p role="alert" className={styles.error}>No pudimos cargar la conversación.</p>;
  if (isLoading || !data) return <p className={styles.cargando}>Cargando…</p>;

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

        <ol className={styles.timeline}>
          {data.timeline.map((item) => {
            if (item.tipo === "mensaje") {
              return (
                <li
                  key={item.id}
                  className={item.rol === "user" ? styles.mensajeUsuario : styles.mensajeAgente}
                >
                  <p>{item.texto}</p>
                  <button
                    type="button"
                    className={styles.botonNota}
                    onClick={() => setAnotando({ messageId: item.id, cita: item.texto.slice(0, 300) })}
                  >
                    Dejar nota
                  </button>
                </li>
              );
            }
            if (item.tipo === "tool-call") {
              return (
                <li key={item.spanId} className={styles.traza}>
                  {item.tool}
                  {item.agente ? ` · ${item.agente}` : ""}
                  {item.error ? " · con error" : ""}
                </li>
              );
            }
            if (item.tipo === "turno-agente") {
              return (
                <li key={item.spanId} className={styles.traza}>
                  turno de {item.agente}
                </li>
              );
            }
            return (
              <li key={item.spanId} className={styles.traza}>
                {item.modelo ?? "modelo desconocido"} · {item.tokensEntrada} entrada /{" "}
                {item.tokensSalida} salida
              </li>
            );
          })}
        </ol>
      </div>

      <aside className={styles.panel}>
        <section className={styles.bloqueLateral}>
          <h2 className={styles.subtitulo}>Caso</h2>
          {data.caso ? (
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
        </section>

        <section className={styles.bloqueLateral}>
          <h2 className={styles.subtitulo}>Notas</h2>
          {anotando ? (
            <NotaComposer
              cita={anotando.cita}
              onCancelar={() => setAnotando(null)}
              onGuardar={guardarNota}
            />
          ) : (
            <button
              type="button"
              className={styles.botonNota}
              onClick={() => setAnotando({ messageId: null, cita: null })}
            >
              Nota sobre la conversación
            </button>
          )}
          {data.notas.map((nota) => (
            <NotaThread
              key={nota.id}
              nota={nota}
              onResponder={responderNota}
              onResolver={resolverNota}
            />
          ))}
        </section>
      </aside>
    </section>
  );
}
