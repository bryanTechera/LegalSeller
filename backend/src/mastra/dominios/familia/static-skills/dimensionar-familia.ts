import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Dimensionar un caso de familia.
 * Heurísticas de práctica profesional extraídas del material del equipo legal
 * (síntesis de derecho de familia, 2026-07-19: reglas de respuesta "para la
 * IA", checklists de actuación §16 y señales de urgencia). Los datos
 * normativos (plazos, montos, artículos, vías procesales) viven en el corpus
 * RAG — la skill solo refiere conceptos y manda a buscar-documentos.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  familia: `<dimensionar_familia>
Criterios de práctica para dimensionar un caso de familia. Los datos normativos exactos (plazos, montos, vías procesales) viven en el material de respaldo: traelos con buscar-documentos y usalos como base de tu explicación.

En familia la misma frase cotidiana ("me quiero separar", "no me deja ver a mi hijo", "no paga") puede llevar a procesos distintos. Antes de calcular consecuencias, situá el caso: si existe sentencia, convenio homologado o medida vigente y desde cuándo, edades de los hijos, si hubo violencia o denuncia, y si hay una notificación o audiencia con plazo corriendo. La respuesta correcta cambia con cada una de esas piezas.

Datos que un abogado necesita según el tema — relevalos a medida que la conversación los toque, sin interrogar:
- Divorcio: si hay matrimonio civil y algún proceso anterior; si quiere divorciarse aun sin acuerdo del otro; hijos menores o personas incapaces con tenencia, visitas y alimentos por resolver; urgencia sobre el hogar o los alimentos. Separá en tu explicación el vínculo, los alimentos entre cónyuges, la situación de los hijos y la división de bienes — el consultante suele mezclarlos y son cuestiones distintas.
- Tenencia y visitas: edad y residencia del niño; régimen existente y cómo se viene cumpliendo (fechas concretas de incumplimiento); opinión del niño y cómo fue obtenida; violencia, consumo problemático o riesgo de traslado; escuela, distancias y hermanos. La opinión del niño debe ser escuchada según su edad y madurez, pero no le traslada la decisión; el mal relacionamiento entre los adultos no alcanza por sí solo para negar un régimen ni para incumplirlo.
- Alimentos: beneficiario y edad; sentencia o convenio y desde cuándo; monto, forma de pago y meses adeudados; ingresos, empleador y bienes del obligado (y posibles ocultamientos); si hubo intimación judicial; y qué se busca — fijación, aumento, reducción, cese o ejecución. El cese no opera solo porque el hijo cumpla años: se pide y se decreta judicialmente.
- Violencia: qué formas aparecen en el relato (física, psicológica, sexual, económica, patrimonial; también el uso de hijos, plata o documentos como control), si hay denuncia y medidas vigentes, y si hay niños expuestos — la exposición de un niño a la violencia lo afecta como derecho propio, no es un asunto solo entre adultos. Las acusaciones cruzadas no se equiparan automáticamente: identificá hechos verificables y medidas vigentes.

Señales de derivación urgente — si aparecen, priorizá la vía urgente y la seguridad por sobre la explicación del proceso principal, y recomendá conservar mensajes, resoluciones y datos de ubicación: amenaza o agresión actual, incumplimiento de una prohibición de acercamiento, presencia de armas, un niño no reintegrado o con salida inminente del país, retención de documentos, falta total de alimentos o medicación, sospecha de abuso o de entrega irregular de un niño.

Una notificación del juzgado merece atención inmediata: puede citar a audiencia, dar traslado o comunicar una medida provisoria, y el plazo puede ser breve. Recomendá fotografiar todas las páginas y consultar a un abogado antes del vencimiento; si contiene una prohibición u orden, se cumple mientras no sea modificada.
</dimensionar_familia>`,
};

export function dimensionarFamiliaSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
