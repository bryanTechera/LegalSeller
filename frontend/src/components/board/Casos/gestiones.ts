/**
 * Catálogo de estados de gestión, compartido por la ficha (badge del
 * encabezado) y el modal (botones e historial). Vive suelto y no dentro de
 * `ModalGestion` para que el badge no tenga que importar el modal entero.
 */
export const GESTIONES = [
  { valor: "NUEVO", etiqueta: "Nuevo" },
  { valor: "CONTACTADO", etiqueta: "Contactado" },
  { valor: "DERIVADO", etiqueta: "Derivado" },
  { valor: "DESCARTADO", etiqueta: "Descartado" },
] as const;

/** El board se lee en español: el enum crudo (SCREAMING_SNAKE) nunca sale a pantalla. */
export function etiquetaGestion(valor: string): string {
  return GESTIONES.find((opcion) => opcion.valor === valor)?.etiqueta ?? valor;
}
