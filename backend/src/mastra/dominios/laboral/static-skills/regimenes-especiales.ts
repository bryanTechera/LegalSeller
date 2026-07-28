import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Reconocer y dimensionar los regímenes laborales especiales
 * habilitados (trabajador rural, call center). Heurística de práctica: cómo
 * identificar que el consultante está en uno de estos regímenes y qué relevar.
 * Los datos normativos (jornadas, licencias, plazos) viven en el corpus RAG,
 * en las subcategorías trabajador-rural y call-center — la skill solo refiere
 * conceptos y manda a buscar-documentos. La regla de no mezclar el régimen
 * especial con el general vive en la rule conducta-laboral.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: `<regimenes_especiales>
Dos regímenes laborales tienen material propio y difieren del régimen general; reconocé cuál aplica antes de responder, porque sus condiciones no son las del trabajador común.

Trabajador rural: quien trabaja fuera de las zonas urbanas bajo un empleador rural (peón, capataz, tambero, trabajos de estancia, chacra o tambo). Su régimen incluye particularidades que el común no tiene: salario por los Consejos de Salarios rurales, vivienda y alimentación a cargo del empleador —que además integran la base del aguinaldo y de la licencia—, y una licencia, feriados y jornada propios. Relevá si le dan vivienda y comida en el establecimiento, el grupo o categoría de actividad, y la antigüedad; traé el detalle con buscar-documentos filtrando por trabajador-rural.

Call center: operador o teleoperador de un centro de atención telefónica. Su régimen fija un límite semanal y una jornada diaria menores a los del común (con descansos y pausas incluidos), condiciones de ambiente y ergonomía del puesto, y derechos ante la escucha de auditoría del desempeño. Relevá las horas reales que trabaja por día y por semana frente a lo que le pagan, y si le informan cuando la escucha arroja una consideración desfavorable; traé el detalle con buscar-documentos filtrando por call-center.
</regimenes_especiales>`,
};

export function regimenesEspecialesSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
