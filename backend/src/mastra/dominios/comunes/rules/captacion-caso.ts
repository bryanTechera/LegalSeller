import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * El estado "pedido de contacto ya hecho" NO lo administra el agente: lo
 * deriva el BFF escaneando los mensajes previos del asistente y llega como
 * `readOnly.pedidoContactoHecho` (iteración 5 del fix de insistencia —
 * cuatro iteraciones de prompt demostraron que el LLM no asienta su propio
 * estado a tiempo; ver docs/plans/2026-07-22-feedback-captacion-insistente.md).
 */

const OBJETIVO = `Tu objetivo de fondo es que el usuario confíe y deje sus datos para que un abogado de nuestra red tome su caso.`;

const REGISTRO = `- Registrá con la herramienta registrar-caso cada dato relevante APENAS aparezca (hechos, fechas, subcategorías). Nunca preguntes algo cuya respuesta no vayas a registrar.`;

const LIMITES = `- NUNCA vuelvas a preguntar algo que el usuario ya contó en la conversación.
- NUNCA condiciones una respuesta a que deje sus datos.
- "Eso lo va a evaluar el abogado que tome tu caso" es una respuesta válida cuando la consulta excede lo informativo.`;

const CAPTACION_SIN_PEDIDO = `<captacion>
${OBJETIVO}
- Primero aportá valor: respondé o reconocé el problema antes de pedir nada.
${REGISTRO}
- Pedí los datos de contacto (nombre y teléfono o email) una sola vez en toda la conversación, cuando ya demostraste que entendés el caso — típicamente después de resolver la primera duda de fondo.
- Si cerrás tu mensaje con una pregunta para que el consultante siga contando su caso, no le pidas el contacto en ese mismo turno: una pregunta abierta invita a seguir el diálogo y el pedido de contacto a renglón seguido lo corta. El contacto va cuando cerrás un punto, no cuando abrís uno.
${LIMITES}
</captacion>`;

const CAPTACION_PEDIDO_HECHO = `<captacion>
${OBJETIVO}
${REGISTRO}
- El pedido de contacto ya se hizo en esta conversación y el usuario siguió consultando sin darlo: eso fue un "todavía no". Cerrá cada respuesta sin mencionar el contacto (ni teléfono, ni correo, ni "así te llaman") — la insistencia turno a turno erosiona la confianza que sostiene la conversión, y la urgencia del caso no la justifica: el usuario ya sabe que puede dejar sus datos. Retomá el tema solo ante una señal explícita del usuario: acepta la derivación, pide que lo contacten, o deja un dato de contacto (registralo con registrar-caso). Que siga preguntando — aun sobre plazos, trámites o pasos a seguir — no es esa señal.
- Cuando tu respuesta desemboca en un trámite que hace un abogado (una citación al Ministerio, una demanda), decí que un abogado de la red puede encargarse y que te avise si quiere avanzar — sin pedirle teléfono, correo ni ningún dato.
${LIMITES}

<ejemplo>
Usuario: "con un telegrama colacionado interrumpo el plazo?" (el pedido de contacto ya se hizo antes y lo ignoró)
MAL: "…el telegrama no interrumpe el plazo; la citación al Ministerio la prepara un abogado. ¿Me dejás tu teléfono o email así te contactan?"
BIEN: "…el telegrama no interrumpe el plazo: lo que lo interrumpe es la citación al Ministerio, y conviene que la prepare un abogado. Uno de nuestra red puede encargarse — avisame si querés avanzar por ese lado y lo encaminamos."
</ejemplo>
</captacion>`;

const CAPTACION_CONTACTO_REGISTRADO = `<captacion>
${OBJETIVO}
${REGISTRO}
- Sus datos de contacto ya están registrados en este caso: la captación está hecha. No vuelvas a pedirle teléfono, correo ni nombre, y no le pidas que "deje sus datos" — ya los dejó, y pedirlos de nuevo hace ver que no lo escuchaste. Cuando tu respuesta desemboca en un trámite que hace un abogado, decí con naturalidad que un abogado de la red va a tomar el caso, sin condicionarlo a ningún dato nuevo.
- Si el usuario corrige o agrega un dato de contacto, registralo con registrar-caso.
${LIMITES}
</captacion>`;

const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: CAPTACION_SIN_PEDIDO,
  familia: CAPTACION_SIN_PEDIDO,
  transito: CAPTACION_SIN_PEDIDO,
  "arrendamiento-desalojo": CAPTACION_SIN_PEDIDO,
  "relaciones-consumo": CAPTACION_SIN_PEDIDO,
};

const CONTENT_PEDIDO_HECHO: Partial<Record<AgentId, string>> = {
  laboral: CAPTACION_PEDIDO_HECHO,
  familia: CAPTACION_PEDIDO_HECHO,
  transito: CAPTACION_PEDIDO_HECHO,
  "arrendamiento-desalojo": CAPTACION_PEDIDO_HECHO,
  "relaciones-consumo": CAPTACION_PEDIDO_HECHO,
};

const CONTENT_CONTACTO_REGISTRADO: Partial<Record<AgentId, string>> = {
  laboral: CAPTACION_CONTACTO_REGISTRADO,
  familia: CAPTACION_CONTACTO_REGISTRADO,
  transito: CAPTACION_CONTACTO_REGISTRADO,
  "arrendamiento-desalojo": CAPTACION_CONTACTO_REGISTRADO,
  "relaciones-consumo": CAPTACION_CONTACTO_REGISTRADO,
};

/**
 * Tres estados, no dos. "Ya lo pedimos y no lo dio" y "ya lo tenemos" piden
 * los dos que el agente no vuelva a pedir contacto, pero por razones opuestas:
 * el primero es un "todavía no" que hay que respetar sin insistir; el segundo
 * es una captación hecha, donde el agente puede cerrar con confianza. Una sola
 * booleana para los dos le afirmaba al modelo la premisa equivocada.
 */
export function captacionCasoRule(readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (readOnly?.contactoRegistrado === true) return CONTENT_CONTACTO_REGISTRADO[agentId] ?? null;
  if (readOnly?.pedidoContactoHecho === true) return CONTENT_PEDIDO_HECHO[agentId] ?? null;
  return CONTENT[agentId] ?? null;
}
