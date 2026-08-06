import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Reconocer y dimensionar los regímenes laborales especiales
 * habilitados (trabajador rural, call center, teletrabajo, plataformas
 * digitales). Heurística de práctica: cómo identificar que el consultante
 * está en uno de estos regímenes y qué relevar. Los datos normativos
 * (jornadas, licencias, plazos) viven en el corpus RAG, en las subcategorías
 * homónimas — la skill solo refiere conceptos y manda a buscar-documentos.
 * La regla de no mezclar el régimen especial con el general vive en la rule
 * conducta-laboral.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: `<regimenes_especiales>
Cuatro regímenes laborales tienen material propio y difieren del régimen general; reconocé cuál aplica antes de responder, porque sus condiciones no son las del trabajador común.

Trabajador rural: quien trabaja fuera de las zonas urbanas bajo un empleador rural (peón, capataz, tambero, trabajos de estancia, chacra o tambo). Su régimen incluye particularidades que el común no tiene: salario por los Consejos de Salarios rurales, vivienda y alimentación a cargo del empleador —que además integran la base del aguinaldo y de la licencia—, y una licencia, feriados y jornada propios. Relevá si le dan vivienda y comida en el establecimiento, el grupo o categoría de actividad, y la antigüedad; traé el detalle con buscar-documentos filtrando por trabajador-rural.

Call center: operador o teleoperador de un centro de atención telefónica. Su régimen fija un límite semanal y una jornada diaria menores a los del común (con descansos y pausas incluidos), condiciones de ambiente y ergonomía del puesto, y derechos ante la escucha de auditoría del desempeño. Relevá las horas reales que trabaja por día y por semana frente a lo que le pagan, y si le informan cuando la escucha arroja una consideración desfavorable; traé el detalle con buscar-documentos filtrando por call-center.

Teletrabajo: quien presta el trabajo, total o parcialmente, fuera del local del empleador usando tecnologías de la información. Su jornada se controla por semana y no por día —el exceso de un día se compensa en la semana en vez de generar horas extras, y el recargo aparece recién al superar el límite semanal—, con un descanso mínimo entre jornadas y derecho a la desconexión; la modalidad exige acuerdo escrito y tiene reglas propias de reversibilidad y de provisión de equipos. Relevá si hay acuerdo escrito, cómo distribuye sus horas en la semana, quién puso los equipos y si lo contactan fuera de horario; traé el detalle con buscar-documentos filtrando por teletrabajo. No confundas teletrabajar con trabajar por una aplicación: el teletrabajador es un dependiente común que trabaja a distancia.

Plataformas digitales: quien reparte bienes o transporta pasajeros a través de una aplicación (delivery, apps de viajes), sea dependiente o autónomo — la ley lo protege en ambos casos y la calificación del vínculo se decide por los hechos, no por el contrato. Tiene derechos propios frente a las decisiones automatizadas (explicación escrita ante bloqueo o suspensión de la cuenta y ante descuentos de pagos), un tiempo de trabajo medido desde el logueo, una retribución mínima aun si el cliente cancela, y cobertura de accidentes. Relevá si la app lo trata como dependiente o autónomo, qué pasó con su cuenta o sus pagos y cuántas horas está logueado; traé el detalle con buscar-documentos filtrando por plataformas-digitales.
</regimenes_especiales>`,
};

export function regimenesEspecialesSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
