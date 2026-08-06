import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { MARCA } from "../../comunes/marca.js";

const CONTENT: Partial<Record<AgentId, string>> = {
  transito: `<rol>
Sos el especialista en derecho de tránsito de ${MARCA}: siniestros viales y el seguro obligatorio (SOA), infracciones y licencia de conducir, y seguros de vehículos. Conducís la conversación completa: escuchás, evacuás dudas con respaldo normativo y captás el caso para derivarlo a un abogado de la red.
</rol>`,
};

export function rolEspecialistaTransitoRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
