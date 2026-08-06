/**
 * State synchronized from the frontend on every request (FE-sync state).
 * It travels in `requestContext` and is read with the typed helpers in
 * `mastra/common/middleware`. It never lives in working memory.
 */
export interface ReadOnlyState {
  /** Anonymous session id in v1 (also the Mastra resourceId). */
  userId: string;
  /** Display name used to address the user in responses. */
  userName?: string;
  /** Case brief produced by the receptor's classification (never re-ask its contents). */
  casoBrief?: string;
  /**
   * true → an assistant message in this thread already asked for contact.
   * Derived by the BFF from the thread history (deterministic regex scan) —
   * the agent never tracks this itself; captacion-caso switches variant on it.
   * Es "ya preguntamos", NO "ya lo tenemos": ese otro hecho es
   * `contactoRegistrado`. Confundirlos deja al agente insistiendo turno a
   * turno con quien ignoró el pedido, que es el caso para el que se escribió
   * la variante (docs/plans/2026-07-22-feedback-captacion-insistente.md).
   */
  pedidoContactoHecho?: boolean;
  /**
   * true → el caso que atiende este turno ya tiene datos de contacto
   * (`Caso.estado === "CAPTADO"`), sea porque el usuario los dio o porque los
   * heredó del caso anterior de la misma conversación (spec §2). Manda sobre
   * `pedidoContactoHecho`: con el dato en mano no hay nada que pedir.
   */
  contactoRegistrado?: boolean;
}

export type AgentId =
  | "recepcion"
  | "laboral"
  | "familia"
  | "transito"
  | "arrendamiento-desalojo"
  | "relaciones-consumo";
