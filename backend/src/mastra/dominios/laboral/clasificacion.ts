/**
 * Classification data for the laboral domain, consumed by the registry.
 * Taxonomy source of truth: docs/dominio-consultas.md.
 */
export const laboralClasificacion = {
  id: "laboral" as const,
  nombre: "Laboral",
  descripcion:
    "Problemas de trabajo: despidos, sueldos o rubros impagos, licencias, accidentes laborales.",
  seniales: [
    "Menciona un empleador, trabajo, sueldo, despido o telegrama",
    "Habla de liquidación, aguinaldo, salario vacacional, horas extra",
    "Relata un accidente o enfermedad vinculada al trabajo",
    "Trabaja en el campo, una estancia, un tambo o una chacra (peón, capataz, trabajador rural)",
    "Es operador o teleoperador de un call center o centro de atención telefónica",
  ],
  habilitada: true,
  subcategorias: [
    {
      id: "despido",
      nombre: "Despido",
      descripcion: "Despido directo o indirecto, indemnización, telegrama, notoria mala conducta.",
      habilitada: true,
    },
    {
      id: "rubros-laborales",
      nombre: "Rubros laborales",
      descripcion:
        "Sueldos o diferencias impagas, horas extras, licencia, salario vacacional, aguinaldo, feriados y descansos trabajados, nocturnidad.",
      habilitada: true,
    },
    {
      id: "trabajador-rural",
      nombre: "Trabajador rural",
      descripcion:
        "Régimen especial del trabajador rural (peón, capataz, tambero): salario y Consejos de Salarios rurales, vivienda y alimentación, jornada y descansos, licencia y feriados propios, seguridad y despido rural. Aplica solo a quien trabaja fuera de las zonas urbanas bajo un empleador rural.",
      habilitada: true,
    },
    {
      id: "call-center",
      nombre: "Call center",
      descripcion:
        "Régimen especial de los operadores de centros de atención telefónica (call centers): jornada de 39 horas semanales y 6 h 30 diarias, pausas, condiciones de ambiente y ergonomía, y derechos ante la escucha de auditoría.",
      habilitada: true,
    },
    { id: "licencias-especiales", nombre: "Licencias especiales", descripcion: "Licencias por estudio, maternidad/paternidad, enfermedad.", habilitada: false },
    { id: "accidentes-laborales", nombre: "Accidentes laborales", descripcion: "Accidentes de trabajo y enfermedades profesionales.", habilitada: false },
  ],
};
