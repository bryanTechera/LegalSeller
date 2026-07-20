import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Dimensionar un reclamo de rubros laborales.
 * Heurísticas de práctica profesional extraídas del material del equipo legal
 * (docs/laboral/*.pdf: jornada y horas extras, descansos/licencia/salario
 * vacacional/aguinaldo, salario, trabajo nocturno; procesado 2026-07-19).
 * Los datos normativos (recargos, fórmulas, leyes) viven en el corpus RAG —
 * la skill solo refiere conceptos y manda a buscar-documentos.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: `<dimensionar_rubros>
Criterios de práctica para dimensionar un reclamo de rubros laborales (sueldos o diferencias, horas extras, licencia, salario vacacional, aguinaldo, feriados y descansos trabajados, nocturnidad). Los datos normativos exactos (recargos, fórmulas, topes, leyes) viven en el corpus: traelos con buscar-documentos y citalos.

Datos que un abogado necesita para dimensionar el reclamo — relevalos a medida que la conversación los toque, sin interrogar:
- Forma de remuneración (mensual, jornalero, destajista, comisionista) y todo lo que percibe además del básico: comisiones, propinas, horas extras, partidas en especie como vivienda, alimentación o vehículo. Buena parte de esas partidas tiene carácter salarial y aumenta la base de cada rubro, y el usuario suele pensar solo en el sueldo base.
- Jornada real: horario y días efectivos, sector de actividad (industria y comercio tienen límites semanales distintos), trabajo nocturno, feriados o descansos trabajados, y si goza el descanso intermedio.
- Qué figura en el recibo de sueldo frente a lo que cobra de verdad: la diferencia entre lo que corresponde y lo que se paga es un rubro reclamable en sí mismo.
- Si el vínculo sigue vigente o terminó, cómo y cuándo terminó: con el egreso todos los créditos laborales se vuelven exigibles, incluida la licencia no gozada, y la fecha del cese pesa en qué se puede reclamar.

Los rubros se arrastran entre sí: las horas extras impagas inciden en la licencia, el salario vacacional, el aguinaldo y hasta en la indemnización por despido. Un reclamo que el consultante ve chico suele ser bastante más grande una vez dimensionado — mostrarlo con el corpus es la mejor razón para que un abogado lo evalúe.

Errores comunes del consultante que vale la pena corregir con el corpus:
- Creer que renunciar hace perder la licencia o el aguinaldo ya generados.
- No saber que el feriado pago trabajado, el descanso trabajado o el trabajo nocturno llevan recargos o sobretasas.
- Creer que propinas, comisiones o pagos en especie no cuentan como salario.

Señales que cambian el dimensionamiento y el usuario rara vez menciona solo: varias horas seguidas de trabajo nocturno, traslados largos a lugares alejados en transporte de la empresa, descansos intermedios que no se gozan, y categorías excluidas de la limitación de jornada (personal superior, vendedores fuera del establecimiento) — en ese último caso el derecho a horas extras puede no existir: verificalo en el corpus antes de afirmarlo.
</dimensionar_rubros>`,
};

export function dimensionarRubrosSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
