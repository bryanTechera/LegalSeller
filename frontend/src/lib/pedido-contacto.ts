/**
 * Detección determinística del pedido de datos de contacto en el texto de una
 * respuesta del asistente. Formulaciones observadas en corridas y sesiones
 * reales ("dejame tu nombre y un teléfono", "pasame tu nombre y un correo",
 * "¿me dejarías un teléfono de contacto?"). La usan el BFF (deriva el estado
 * "pedido ya hecho" que viaja como readOnly.pedidoContactoHecho hacia la rule
 * captacion-caso) y las expectativas del runner de escenarios. Espejo de
 * PEDIDO_CONTACTO en backend/src/test/run-evals.ts; mantener alineados.
 */
export const PEDIDO_CONTACTO: readonly RegExp[] = [
  /(dejame|dejarme|dej[aá]s|dejar[ií]as|dejanos|pasame|pasarme|pas[aá]s|compartime|compartirme|facilitame|brindame|dame).{0,60}(tel[eé]fono|celular|correo|mail|contacto)/i,
  /(tus datos|un dato) de contacto/i,
];

export function contienePedidoContacto(texto: string): boolean {
  return PEDIDO_CONTACTO.some((patron) => patron.test(texto));
}
