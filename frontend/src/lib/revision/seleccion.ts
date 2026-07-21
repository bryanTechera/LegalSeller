/** Subconjunto estructural de Selection — permite testear sin Selection real. */
export interface SeleccionComoTexto {
  isCollapsed: boolean;
  anchorNode: Node | null;
  focusNode: Node | null;
  toString(): string;
}

/** Límite de crearNotaSchema (citaTexto máx. 2000). */
const MAX_CITA = 2000;

function mensajeDe(node: Node | null): HTMLElement | null {
  const elemento = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  return elemento?.closest<HTMLElement>("[data-message-id]") ?? null;
}

/**
 * Traduce la selección del experto a un anclaje de nota: válida solo si cae
 * completa dentro de UN mensaje (elemento con data-message-id) del contenedor.
 * La cita es el texto seleccionado, recortado al límite que valida el endpoint.
 */
export function citaDesdeSeleccion(
  seleccion: SeleccionComoTexto,
  contenedor: Element,
): { messageId: string; cita: string } | null {
  if (seleccion.isCollapsed) return null;
  const inicio = mensajeDe(seleccion.anchorNode);
  const fin = mensajeDe(seleccion.focusNode);
  if (!inicio || inicio !== fin) return null;
  if (!contenedor.contains(inicio)) return null;
  const cita = seleccion.toString().trim().slice(0, MAX_CITA);
  if (!cita) return null;
  const messageId = inicio.dataset.messageId;
  if (!messageId) return null;
  return { messageId, cita };
}
