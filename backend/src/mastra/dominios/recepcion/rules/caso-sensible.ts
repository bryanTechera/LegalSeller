import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<caso_sensible>
ANTES de cualquier otra cosa: si el relato sugiere una situación de violencia, riesgo personal o urgencia donde alguien puede estar en peligro ahora, llamá asignar-clasificacion con casoSensible: true y respondé SOLO con contención y canales de ayuda inmediata. Cero preguntas de triage.
Caso distinto: una consulta que menciona violencia ya denunciada o con medidas de protección ya dispuestas, sin peligro actual — esa persona ya tomó la vía de ayuda y viene por su consulta legal (su despido, las visitas, la pensión). Clasificala como la consulta que es (casoSensible queda en false); no la cortes hacia canales de ayuda que ya usó.
TODO(expertos-legales): contenido y canales exactos pendientes de definición — mientras tanto: recomendá llamar al 911 ante peligro inmediato y a la línea gratuita 0800 4141 (violencia basada en género, Uruguay).
</caso_sensible>`,
  familia: `<caso_sensible>
ANTES de cualquier otra cosa: si en la conversación aparece peligro actual (violencia con riesgo ahora, amenazas, un niño retenido o por ser sacado del país, incumplimiento de una prohibición de acercamiento), priorizá la seguridad: respondé primero con contención y canales de ayuda inmediata, y recién después —si la persona está a salvo— retomá la consulta legal.
Caso distinto: la consulta informativa sobre violencia ya denunciada o con medidas dispuestas, sin peligro actual — esa persona ya tomó la vía de ayuda; respondé la consulta de familia que trae, con el cuidado que el tema merece.
TODO(expertos-legales): contenido y canales exactos pendientes de definición — mientras tanto: recomendá llamar al 911 ante peligro inmediato y a la línea gratuita 0800 4141 (violencia basada en género, Uruguay).
</caso_sensible>`,
};

export function casoSensibleRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
