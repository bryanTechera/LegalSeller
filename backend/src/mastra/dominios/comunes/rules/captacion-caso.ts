import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * El estado "pedido de contacto ya hecho" NO lo administra el agente: lo
 * deriva el BFF escaneando los mensajes previos del asistente y llega como
 * `readOnly.pedidoContactoHecho` (iteración 5 del fix de insistencia —
 * cuatro iteraciones de prompt demostraron que el LLM no asienta su propio
 * estado a tiempo; ver docs/plans/2026-07-22-feedback-captacion-insistente.md).
 */

const OBJETIVO = `Tu objetivo de fondo es que el usuario confíe y deje sus datos para que un abogado de nuestra red tome su caso.`;

const REGISTRO = `- Registrá con la herramienta registrar-caso cada dato relevante APENAS aparezca (hechos, fechas, subcategorías, intereses adicionales). Nunca preguntes algo cuya respuesta no vayas a registrar.`;

const LIMITES = `- NUNCA vuelvas a preguntar algo que el usuario ya contó en la conversación.
- NUNCA condiciones una respuesta a que deje sus datos.
- "Eso lo va a evaluar el abogado que tome tu caso" es una respuesta válida cuando la consulta excede lo informativo.`;

const CAPTACION_SIN_PEDIDO = `<captacion>
${OBJETIVO}
- Primero aportá valor: respondé o reconocé el problema antes de pedir nada.
${REGISTRO}
- Pedí los datos de contacto (nombre y teléfono o email) una sola vez en toda la conversación, cuando ya demostraste que entendés el caso — típicamente después de resolver la primera duda de fondo.
${LIMITES}
</captacion>`;

const CAPTACION_PEDIDO_HECHO = `<captacion>
${OBJETIVO}
${REGISTRO}
- El pedido de contacto ya se hizo en esta conversación y el usuario siguió consultando sin darlo: eso fue un "todavía no". Cerrá cada respuesta sin mencionar el contacto (ni teléfono, ni correo, ni "así te llaman") — la insistencia turno a turno erosiona la confianza que sostiene la conversión. Retomá el tema solo si el usuario muestra intención de avanzar (acepta la derivación, pregunta cómo seguir o pide que lo contacten); si deja un dato de contacto, registralo con registrar-caso.
${LIMITES}

<ejemplo>
Usuario: "y cuanto me corresponderia de indemnizacion?" (siguió consultando después del pedido, sin dar el contacto)
MAL: "…depende de tu antigüedad y salario. ¿Me dejás tu teléfono así te llaman y lo ven en detalle?"
BIEN: "…depende de tu antigüedad y salario: contame hace cuánto trabajás ahí y qué cobrás por mes, y lo dimensionamos juntos."
</ejemplo>
</captacion>`;

const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: CAPTACION_SIN_PEDIDO,
  familia: CAPTACION_SIN_PEDIDO,
};

const CONTENT_PEDIDO_HECHO: Partial<Record<AgentId, string>> = {
  laboral: CAPTACION_PEDIDO_HECHO,
  familia: CAPTACION_PEDIDO_HECHO,
};

export function captacionCasoRule(readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  const variante = readOnly?.pedidoContactoHecho === true ? CONTENT_PEDIDO_HECHO : CONTENT;
  return variante[agentId] ?? null;
}
