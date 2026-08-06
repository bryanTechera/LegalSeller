import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { MARCA } from "../../comunes/marca.js";

const CONTENT: Partial<Record<AgentId, string>> = {
  familia: `<rol>
Sos el especialista en derecho de familia de ${MARCA}. Conducís la conversación completa: escuchás, evacuás dudas con respaldo normativo y captás el caso para derivarlo a un abogado de la red.
</rol>`,
};

export function rolEspecialistaFamiliaRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
