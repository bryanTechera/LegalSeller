import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Dimensionar un caso de arrendamiento o desalojo.
 * Heurísticas de práctica profesional extraídas del material del equipo legal
 * (síntesis de arrendamientos urbanos y desalojo, 2026-07-19: preguntas
 * mínimas de encuadre, checklists de actuación §10 y criterios de derivación
 * §14.9). Los datos normativos (plazos, requisitos, artículos, vías
 * procesales) viven en el corpus RAG — la skill solo refiere conceptos y
 * manda a buscar-documentos.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  "arrendamiento-desalojo": `<dimensionar_arrendamiento>
Criterios de práctica para dimensionar un caso de arrendamiento o desalojo. Los datos normativos exactos (plazos, requisitos, vías procesales) viven en el material de respaldo: traelos con buscar-documentos y usalos como base de tu explicación.

En esta materia no existe un único "régimen de alquileres": la respuesta correcta cambia con el encuadre del contrato. Antes de calcular consecuencias, situá el caso — relevá a medida que la conversación lo toque, sin interrogar:
- El destino real y principal del inmueble: vivienda, comercio/industria u otro no habitacional, vivienda por temporada en zona turística, o explotación agrícola, pecuaria o agropecuaria (predio rural — un régimen separado, con plazos propios).
- Si existe garantía a favor del arrendador (depósito, fiador, seguro, aval, retención) o el contrato es del régimen sin garantía, y si declara expresamente el sometimiento a la Ley 19.889.
- Si el contrato es escrito, su fecha, plazo, y si alguna parte comunicó que no renovaba — y con qué prueba de contenido, fecha y recepción.
- La causal concreta del conflicto: vencimiento, falta de pago (cuántos meses, si hubo intimación y por qué medio), ocupación sin contrato o prestada, daños, subarriendo no autorizado.
- Si ya hubo intimación, notificación judicial, cedulón o fecha de lanzamiento: qué documento recibió y en qué fecha exacta — de eso dependen plazos breves que pueden estar corriendo, y quien consulta suele confundir el plazo para defenderse con el plazo para irse.

Documentación que conviene pedirle al consultante que reúna: el contrato completo con sus anexos e inventario (una foto de la primera página rara vez alcanza para determinar el régimen), recibos y comprobantes de pago, las comunicaciones entre las partes, y — si recibió un documento judicial — todas las páginas, legibles, identificando la fecha de notificación.

Consulta preventiva (va a firmar o armar un contrato): transformá los puntos que un contrato debe resolver en preguntas concretas — destino, garantía o su ausencia deliberada, plazo y renovación, moneda y reajuste, gastos y reparaciones, ocupantes y subarriendo, inventario y estado, domicilios y medios de notificación con prueba de recepción. No redactes el contrato: relevá qué le falta resolver y encaminá la redacción a un abogado.

Señales de derivación urgente — si aparecen, priorizá encaminar el caso por sobre la explicación general del proceso: una notificación judicial o un plazo procesal en curso; fecha de lanzamiento fijada o riesgo de desocupación inminente; pago alegado sin recibo, consignación o discusión sobre la validez de una notificación; menores, embarazo, discapacidad, personas mayores o situaciones de violencia o vulnerabilidad en el inmueble; imposibilidad de determinar el régimen con lo que el consultante aporta; pedido de redactar excepciones, demandas, recursos o acuerdos de entrega.
</dimensionar_arrendamiento>`,
};

export function dimensionarArrendamientoSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
