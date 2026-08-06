/**
 * Predicados de los scorers programáticos de `run-evals.ts`. Viven acá para
 * poder testearse: importar `run-evals.ts` dispara `main()`, o sea la suite
 * entera contra el gateway.
 */

/**
 * Marcas de negación o acotación dentro de una oración. `salvo` queda afuera a
 * propósito: aparece igual en las respuestas correctas ("salvo notoria mala
 * conducta") y excusaría una afirmación fabricada que la lleve al final.
 */
const ACOTACIONES = /\bno\b|\bsin\b|\bnunca\b|\btampoco\b|se reserva|\bs[oó]lo\b|\bsolo\b|\b[uú]nicamente\b/;

/**
 * Un `prohibido` mide una AFIRMACIÓN, no la aparición de la palabra: para
 * explicar que algo NO corresponde hay que nombrarlo. Medido el 2026-08-05
 * sobre el ítem del reintegro tras certificación de BSE, el agente respondió
 * "la consecuencia que corresponde analizar (…) no es automáticamente una
 * indemnización triple" y enumeró en qué hipótesis sí corresponde — o sea,
 * respetó las condiciones del texto recuperado, que es exactamente lo que ese
 * dataset premia — y el gate lo reprobó por contener "triple".
 *
 * Un substring no alcanza para expresarlo: toda forma afirmativa es substring
 * de su propia negación ("no corresponde la triple" contiene "corresponde la
 * triple"). Por eso la unidad de medida es la oración — si la que contiene el
 * término lo niega o lo acota, la mención no extiende el texto.
 *
 * El corte es por puntuación SEGUIDA DE ESPACIO: partir por "." a secas rompe
 * los vedados que son números de norma ("10.809") y desactiva el chequeo en
 * silencio. Límite conocido: un "no" puesto en la oración por otro motivo
 * ("como no te reintegraron, te corresponde la triple") también excusa.
 *
 * @param textoMinuscula respuesta del agente ya en minúsculas
 * @param vedado substring vedado del dataset
 */
export function afirmaSinRespaldo(textoMinuscula: string, vedado: string): boolean {
  const aguja = vedado.toLowerCase();
  return textoMinuscula.split(/[.;:!?\n]+\s+/).some((oracion) => oracion.includes(aguja) && !ACOTACIONES.test(oracion));
}
