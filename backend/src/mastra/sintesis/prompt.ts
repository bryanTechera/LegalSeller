import type { MaterialSintesis } from "./schema.js";

/**
 * Entra en la huella del material (`frontend/src/lib/casos/huella.ts`):
 * cambiar el prompt marca stale a todas las síntesis, igual que
 * PIPELINE_VERSION con el corpus. Subila con cada cambio de contenido.
 */
export const PROMPT_VERSION = "1";

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
En situacion dá el panorama en un párrafo: quién es, qué le pasó y en qué punto está. En hechos poné la cronología, un hecho por entrada, con la fecha que haya dicho o null si no la dijo.
En datosClave poné lo que sirve para dimensionar el reclamo, con la etiqueta que corresponda a este caso — por ejemplo antigüedad, salario nominal, fecha del despido, forma de la desvinculación. Solo los que la persona dio.
En pedido escribí qué vino a resolver, con sus palabras traducidas a las de un abogado.
En faltantes poné lo que haría falta preguntarle y la conversación no responde.
Describí el caso y no la conversación: no menciones al asistente, ni al chat, ni cómo se obtuvo cada dato.
Sin emojis.
</reglas>`;

/** El material como texto plano para el prompt de usuario. */
export function formatearMaterial(material: MaterialSintesis): string {
  const { caso, mensajes } = material;
  const encabezado = [
    `Categoría del caso: ${caso.categoria ?? "sin categoría asignada (pedido fuera de cobertura)"}`,
    `Subcategorías: ${caso.subcategorias.join(", ") || "ninguna registrada"}`,
    `Estado: ${caso.estado}`,
    caso.resumen ? `Registrado hasta ahora: ${caso.resumen}` : null,
  ]
    .filter((linea): linea is string => linea !== null)
    .join("\n");

  const conversacion = mensajes
    .map((mensaje) => `${mensaje.rol === "user" ? "Consultante" : "Asistente"}: ${mensaje.texto}`)
    .join("\n\n");

  return `<caso>\n${encabezado}\n</caso>\n\n<conversacion>\n${conversacion}\n</conversacion>`;
}
