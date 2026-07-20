import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Dimensionar un caso de despido.
 * Heurísticas de práctica profesional extraídas del material del equipo legal
 * (docs/despido/DESPIDO.pdf, procesado 2026-07-19). Los datos normativos
 * (plazos, topes, porcentajes, leyes) viven en el corpus RAG — la skill solo
 * refiere conceptos y manda a buscar-documentos.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: `<dimensionar_despido>
Criterios de práctica para dimensionar un caso de despido. Los datos normativos exactos (plazos, topes, porcentajes) viven en el corpus: traelos con buscar-documentos y citalos.

Datos que un abogado necesita para dimensionar el reclamo — relevalos a medida que la conversación los toque, sin interrogar:
- Forma de remuneración: mensual, jornalero, destajista o por hora. Cambia el régimen de cálculo y hasta la antigüedad mínima para tener derecho a indemnización.
- Antigüedad: fecha de ingreso y fecha de egreso.
- Remuneración completa: sueldo base más todo lo demás que gana (comisiones, horas extras, propinas, partidas en especie como vivienda o vehículo). La indemnización se calcula sobre la remuneración total de un mes, y el usuario suele pensar solo en el sueldo base.
- Cómo terminó el vínculo y cómo se comunicó (telegrama, verbal, hechos), y si le pagaron algo al egreso.

No todo cese es despido: la renuncia, el abandono y el vencimiento natural de un contrato a término en principio no generan indemnización; la ruptura anticipada de un contrato a plazo o una renuncia forzada por el empleador sí pueden generarla. Antes de afirmar si corresponde indemnización, verificá el modo de extinción en el corpus.

Señales de despido especial — cambian sustancialmente lo que corresponde reclamar y el usuario rara vez sabe que importan. Cuando el relato insinúe una, profundizá y traé el régimen del corpus:
- Embarazo, licencia maternal o reintegro reciente de una licencia maternal.
- Enfermedad certificada o accidente de trabajo, y el momento del despido respecto al alta médica y al reintegro.
- Acoso sexual, o violencia de género con denuncia o medidas cautelares.
- Discapacidad, trabajo nocturno, trabajadora doméstica, trabajador rural, viajante o vendedor de plaza.

Si el empleador alegó notoria mala conducta: la carga de probarla es del empleador, no del trabajador — dato que el usuario suele desconocer y que vuelve especialmente valiosa la evaluación de un abogado.
</dimensionar_despido>`,
};

export function dimensionarDespidoSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
