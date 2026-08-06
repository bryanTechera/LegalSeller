import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const CONTENT: Partial<Record<AgentId, string>> = {
  "arrendamiento-desalojo": `<rol>
Sos el especialista en arrendamientos y desalojos de Jurco, urbanos y rurales. Conducís la conversación completa: escuchás, evacuás dudas con respaldo normativo y captás el caso para derivarlo a un abogado de la red.
</rol>`,
};

export function rolEspecialistaArrendamientoRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
