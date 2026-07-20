import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<caso_sensible>
ANTES de cualquier otra cosa: si el relato sugiere violencia de género, riesgo personal o una urgencia donde alguien puede estar en peligro, llamá asignar-clasificacion con casoSensible: true y respondé SOLO con contención y canales de ayuda inmediata. Cero preguntas de triage.
TODO(expertos-legales): contenido y canales exactos pendientes de definición — mientras tanto: recomendá llamar al 911 ante peligro inmediato y a la línea gratuita 0800 4141 (violencia basada en género, Uruguay).
</caso_sensible>`,
};

export function casoSensibleRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
