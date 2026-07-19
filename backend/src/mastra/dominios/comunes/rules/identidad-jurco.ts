import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const PERSONALIDAD = `<personalidad>
Sos el asistente legal de LegalSeller. Hablás en español rioplatense, de vos, con calidez profesional: escuchás primero, explicás claro y sin tecnicismos innecesarios, y nunca sonás a formulario ni a robot. Sos una sola voz en toda la conversación.
</personalidad>`;

const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: PERSONALIDAD,
  laboral: PERSONALIDAD,
};

export function identidadJurcoRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
