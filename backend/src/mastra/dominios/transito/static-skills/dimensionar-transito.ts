import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Dimensionar un caso de tránsito.
 * Heurísticas de práctica derivadas del material del equipo legal (régimen
 * del SOA y su procedimiento de reclamo, régimen de infracciones, contrato
 * de seguro). Los datos normativos (plazos, topes, sanciones) viven en el
 * corpus RAG — la skill solo refiere conceptos y manda a buscar-documentos.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  transito: `<dimensionar_transito>
Criterios de práctica para dimensionar un caso de tránsito. Los datos normativos exactos (plazos, topes, requisitos, sanciones) viven en el material de respaldo: traelos con buscar-documentos y usalos como base de tu explicación.

Un mismo relato ("me chocaron") puede abrir vías distintas: el reclamo al seguro obligatorio si hubo lesionados o fallecidos, el derecho común por los daños materiales o por una indemnización mayor, el reclamo a la propia aseguradora si hay cobertura contratada, y la vía administrativa si además hay multas o retención de la licencia. Situá el caso — qué vías están en juego — antes de explicar consecuencias.

Datos que un abogado necesita según el tema — relevalos a medida que la conversación los toque, sin interrogar:
- Siniestro con lesionados: fecha y lugar del hecho (los plazos de reclamo corren desde ahí); quiénes resultaron lesionados y su vínculo con el vehículo (los terceros reclaman al seguro obligatorio; el conductor y su núcleo cercano no cuentan como terceros de su propio seguro); si intervino la policía y hay parte; certificados médicos de la atención inmediata y del centro al que se derivó; datos del otro vehículo (matrícula, conductor, aseguradora) o si se retiró sin identificarse — un vehículo no identificado o sin seguro no cierra el reclamo: cambia la vía; y si ya se presentó un reclamo ante una aseguradora, cuándo y qué respondió.
- Conflicto con la aseguradora propia: compañía y tipo de cobertura; si el siniestro fue denunciado y cuándo (el plazo de denuncia es corto y perderlo hace perder el derecho); qué respondió la aseguradora y hace cuánto (el silencio y la demora tienen consecuencias legales a favor del asegurado); si hay franquicia; qué documentación pidió y cuál falta.
- Multas y licencia: qué infracción le atribuyen, cuándo y cómo se notificó (en el acto, al domicilio, por cámara); si la multa es de otro departamento; si hubo espirometría, su resultado, si le entregaron el acta y si le retuvieron la licencia; si presentó recursos y cuándo; y si acumula otras sanciones recientes.

Señales que cambian la urgencia: un plazo breve corriendo (la denuncia del siniestro a la aseguradora, una respuesta denegatoria reciente que abre la vía judicial, el vencimiento de un recurso), un lesionado sin atención médica documentada (el certificado del momento sostiene el reclamo después), o un vehículo secuestrado o inmovilizado por la autoridad.

El reclamo por un siniestro se gana con documentos. Recomendá conservar y fotografiar todo: parte policial, certificados médicos, acta de espirometría, notificaciones recibidas, fotos del lugar y de los vehículos, y datos de testigos.
</dimensionar_transito>`,
};

export function dimensionarTransitoSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
