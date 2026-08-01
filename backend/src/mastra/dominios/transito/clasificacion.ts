/**
 * Clasificación de la categoría Tránsito. Habilitada 2026-07-31 a partir del
 * material del equipo legal (Ley 18.191, Ley 19.824, Ley 18.412 SOA y sus
 * decretos reglamentarios, Ley 19.678, Reglamento Nacional de Circulación
 * Vial). Sin subcategorías en v1: la partición del dominio quedó propuesta al
 * equipo legal (docs/preguntas-legales/2026-07-31-transito.md) — el corpus va
 * entero a nivel categoría (`subcategoria = NULL`) y los hechos del caso se
 * registran en el brief. Registro: docs/plans/2026-07-31-procesamiento-transito.md.
 */
export const transitoClasificacion = {
  id: "transito" as const,
  nombre: "Tránsito",
  descripcion:
    "Siniestros de tránsito y sus consecuencias: lesiones o muerte de terceros (reclamo al seguro obligatorio SOA), multas e infracciones, retención o suspensión de la licencia de conducir, controles de alcoholemia y conflictos con la aseguradora del vehículo por un siniestro.",
  seniales: [
    "Relata un choque, un atropello o un siniestro en la vía pública, con o sin lesionados",
    "Menciona el seguro del auto o de la moto: un reclamo, un rechazo de cobertura o una demora en el pago",
    "Habla de una multa, un exceso de velocidad detectado por radar o el permiso por puntos",
    "Menciona una espirometría, un control de alcoholemia o que le retuvieron la libreta de conducir",
  ],
  habilitada: true,
  subcategorias: [],
};
