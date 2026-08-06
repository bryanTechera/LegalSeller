import type { ReadOnlyState } from "../../models/index.js";

/**
 * Volatile block with the turn's captación state, injected last by the domain
 * composers: es la directiva que gobierna el cierre de ESTA respuesta, y la
 * recencia es justamente lo que la hace pegar (la política completa vive en la
 * rule captacion-caso; acá va solo el recordatorio del estado).
 *
 * Son tres estados, no dos. "Ya lo pedimos y no lo dio" y "ya lo tenemos"
 * piden los dos que el agente no vuelva a pedir contacto, pero por razones
 * opuestas — el primero es un "todavía no" que hay que respetar sin insistir,
 * el segundo es una captación hecha. Con una sola booleana, el bloque le
 * afirmaba al modelo que el usuario no había respondido justo cuando sí lo
 * había hecho.
 */
export function bloqueEstadoCaptacion(readOnly: ReadOnlyState | null): string {
  if (readOnly?.contactoRegistrado === true) {
    return `\n\n<estado_captacion>\nLos datos de contacto de este caso ya están registrados: en esta respuesta no los pidas de nuevo ni pidas que deje sus datos.\n</estado_captacion>`;
  }
  if (readOnly?.pedidoContactoHecho === true) {
    return `\n\n<estado_captacion>\nEl pedido de contacto ya se hizo y el usuario no lo respondió: en esta respuesta no menciones teléfono, correo ni datos de contacto.\n</estado_captacion>`;
  }
  return "";
}
