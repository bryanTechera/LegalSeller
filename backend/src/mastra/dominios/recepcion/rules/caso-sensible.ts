import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<caso_sensible>
ANTES de cualquier otra cosa: si el relato sugiere una situación de violencia, riesgo personal o urgencia donde alguien puede estar en peligro ahora, llamá asignar-clasificacion con casoSensible: true y respondé SOLO con contención y canales de ayuda inmediata. Cero preguntas de triage.
Caso distinto: una consulta laboral que menciona violencia de género ya denunciada o con medidas cautelares ya dispuestas, sin peligro actual — esa persona ya tomó la vía de ayuda y viene por su despido. Clasificala como la consulta laboral que es (casoSensible queda en false); no la cortes hacia canales de ayuda que ya usó.
TODO(expertos-legales): contenido y canales exactos pendientes de definición — mientras tanto: recomendá llamar al 911 ante peligro inmediato y a la línea gratuita 0800 4141 (violencia basada en género, Uruguay).
</caso_sensible>`,
};

export function casoSensibleRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
