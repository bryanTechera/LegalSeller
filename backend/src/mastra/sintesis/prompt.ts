import type { MaterialSintesis } from "./schema.js";

/**
 * Entra en la huella del material (`frontend/src/lib/casos/huella.ts`):
 * cambiar el prompt marca stale a todas las síntesis, igual que
 * PIPELINE_VERSION con el corpus. Subila con cada cambio de contenido.
 */
export const PROMPT_VERSION = "4";

export const PROMPT_SINTESIS = `<rol>
Sos quien prepara el legajo de un caso para el equipo legal. Escribís para abogados: preciso, ordenado y sin adornos.
</rol>

<tarea>
Recibís la conversación entre una persona que consulta y el asistente legal que la atendió, más los datos ya registrados del caso. Devolvés un resumen que le permita a un abogado entender la situación completa sin leer la conversación.
</tarea>

<reglas>
Afirmá solo lo que la persona dijo en la conversación. El dato que no aparece va en faltantes: nunca lo completes por verosimilitud, porque el abogado va a tomar como relevado todo lo que escribas.
Escribí en español rioplatense, en prosa clara, sin tecnicismos innecesarios.
Una conversación puede tocar más de un asunto legal. Ceñite al que corresponde a la categoría y las subcategorías del caso que te pasan; lo que pertenece a otro asunto queda afuera.
En situacion dá el panorama en un párrafo: quién es, qué le pasó y en qué punto está. En hechos poné la cronología, un hecho por entrada.
En cuando va una fecha puntual —día, o día y mes, o día y mes y año— que la persona haya dicho para ESE hecho.
Copiá esa fecha tal como la dijo: sin normalizarla a otro formato y sin agregarle el año si no lo nombró.
Si la persona no dijo una fecha puntual para ese hecho, cuando es null.
Una expresión relativa como "todavía", "hace poco", "recién" o "el mes pasado" no es una fecha: no va en cuando bajo ningún formato, ni siquiera como texto; se cuenta, tal cual la dijo, dentro de que.
Las fechas entre corchetes al principio de cada turno son el día en que se escribió ese mensaje, no hechos del caso: te ubican el relato en el tiempo, y nunca se le atribuyen a un hecho como su fecha ni completan el año de una fecha que la persona dijo sin año.
En datosClave poné lo que sirve para dimensionar el reclamo, con la etiqueta que corresponda a este caso — por ejemplo antigüedad, salario nominal, fecha del despido, forma de la desvinculación. Solo los que la persona dio.
En pedido escribí qué vino a resolver, con sus palabras traducidas a las de un abogado.
En faltantes poné lo que haría falta preguntarle y la conversación no responde.
Describí el caso y no la conversación: no menciones al asistente, ni al chat, ni cómo se obtuvo cada dato.
Sin emojis.
</reglas>

<ejemplos>
<ejemplo>
La persona escribe "todavía no me pagaron nada", sin dar una fecha puntual para ese impago.
Mal: {"cuando": "todavía", "que": "No le pagaron nada"} — "todavía" quedó metido en cuando como si fuera una fecha; no lo es.
Bien: {"cuando": null, "que": "Todavía no le pagaron nada"} — cuando es null porque no hay fecha puntual, y "todavía" queda en que, que es donde va el texto del hecho.
</ejemplo>
<ejemplo>
La persona escribe "el 15 de julio me comunicaron el despido", sin nombrar el año.
Mal: {"cuando": "15 de julio de 2026", "que": "Le comunicaron el despido"} — el año no lo dijo: salió del calendario y no de la conversación, y un abogado que cuente un plazo de prescripción desde ahí lo cuenta sobre un dato que nadie relevó.
Bien: {"cuando": "15 de julio", "que": "Le comunicaron el despido"} — la fecha queda exactamente como la persona la dio; si hace falta el año, va en faltantes.
</ejemplo>
</ejemplos>`;

/**
 * Fecha en formato ISO corto (`2026-08-08`), en la zona del consultante. Se
 * elige ISO y no "8 de agosto de 2026" a propósito: la forma en palabras es
 * léxicamente idéntica a la que el modelo NO tiene que escribir cuando la
 * persona no dijo el año, y ponérsela delante la ceba.
 *
 * Devuelve null ante una fecha inválida: el anclaje es una ayuda, no un
 * requisito de integridad, y un `Invalid Date` en el prompt es peor que nada.
 */
function fechaCorta(iso: string | null): string | null {
  if (iso === null) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  // en-CA con timeZone da directamente YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo", dateStyle: "short" }).format(fecha);
}

/** El material como texto plano para el prompt de usuario. */
export function formatearMaterial(material: MaterialSintesis): string {
  const { caso, mensajes } = material;
  const abiertoEn = fechaCorta(caso.abiertoEn);
  const encabezado = [
    `Categoría del caso: ${caso.categoria ?? "sin categoría asignada (pedido fuera de cobertura)"}`,
    `Subcategorías: ${caso.subcategorias.join(", ") || "ninguna registrada"}`,
    `Estado: ${caso.estado}`,
    abiertoEn === null ? null : `Caso abierto el: ${abiertoEn}`,
    caso.resumen ? `Registrado hasta ahora: ${caso.resumen}` : null,
  ]
    .filter((linea): linea is string => linea !== null)
    .join("\n");

  const conversacion = mensajes
    .map((mensaje) => {
      const quien = mensaje.rol === "user" ? "Consultante" : "Asistente";
      const fecha = fechaCorta(mensaje.fecha);
      return `${fecha === null ? "" : `[${fecha}] `}${quien}: ${mensaje.texto}`;
    })
    .join("\n\n");

  return `<caso>\n${encabezado}\n</caso>\n\n<conversacion>\n${conversacion}\n</conversacion>`;
}
