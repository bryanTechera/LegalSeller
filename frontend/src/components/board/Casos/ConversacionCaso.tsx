"use client";

import useSWR from "swr";

import { TextoMarkdown } from "@/components/shared/TextoMarkdown/TextoMarkdown";
import type { DetalleConversacion } from "@/lib/board/conversaciones";

import styles from "./casos.module.css";

async function traer(url: string): Promise<DetalleConversacion> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar la conversación");
  return (await response.json()) as DetalleConversacion;
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * La conversación que dio origen al caso, para leerla sin salir de la ficha.
 *
 * Es a propósito SOLO el intercambio: las fuentes del corpus, las notas por
 * mensaje y el detalle de tokens son revisión técnica del agente y viven en el
 * tab Chats. Meterlas acá traería un segundo sistema de notas a una pantalla
 * que ya tiene el suyo (las del caso, en el lateral).
 *
 * Reusa el endpoint del board que ya sirve al tab Chats — mismo contrato,
 * misma autorización — y se monta solo cuando la vista está abierta, así la
 * ficha no paga la conversación entera en su carga inicial.
 */
export function ConversacionCaso({ conversationId }: { conversationId: string }) {
  const { data, error, isLoading } = useSWR(`/api/board/conversaciones/${conversationId}`, traer);

  if (error) {
    return <p role="alert" className={styles.error}>No pudimos cargar la conversación.</p>;
  }
  if (isLoading || !data) return <p className={styles.cargando}>Cargando la conversación…</p>;

  const mensajes = data.timeline.filter((item) => item.tipo === "mensaje");

  return (
    <>
      {data.casos.length > 1 ? (
        <p className={styles.ayuda}>
          Esta conversación produjo {data.casos.length} casos: abajo está completa, no solo la parte
          de este caso.
        </p>
      ) : null}

      {data.intentosExtraccion > 0 ? (
        <p role="status" className={styles.aviso}>
          El filtro de confidencialidad tuvo que redactar la respuesta {data.intentosExtraccion}{" "}
          {data.intentosExtraccion === 1 ? "vez" : "veces"}. Reglas que saltaron:{" "}
          {data.reglasExtraccion.join(", ")}.
        </p>
      ) : null}

      {mensajes.length === 0 ? (
        <p className={styles.etiqueta}>Esta conversación no tiene mensajes guardados.</p>
      ) : (
        <ol className={styles.conversacion}>
          {mensajes.map((mensaje) => (
            <li
              key={mensaje.id}
              className={mensaje.rol === "user" ? styles.mensajeUsuario : styles.mensajeAgente}
            >
              <p className={styles.autorMensaje}>
                {mensaje.rol === "user" ? "Consultante" : "Asistente"} · {hora(mensaje.fecha)}
              </p>
              {/* El agente responde en markdown; el consultante escribe plano. */}
              {mensaje.rol === "assistant" ? (
                <TextoMarkdown texto={mensaje.texto} />
              ) : (
                <p>{mensaje.texto}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
