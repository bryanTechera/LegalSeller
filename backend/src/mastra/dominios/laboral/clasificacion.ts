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
  ],
  habilitada: true,
  subcategorias: [
    {
      id: "despido",
      nombre: "Despido",
      descripcion: "Despido directo o indirecto, indemnización, telegrama, notoria mala conducta.",
      habilitada: true,
    },
    { id: "rubros-laborales", nombre: "Rubros laborales", descripcion: "Sueldos, aguinaldo, licencia, horas extra impagas.", habilitada: false },
    { id: "licencias-especiales", nombre: "Licencias especiales", descripcion: "Licencias por estudio, maternidad/paternidad, enfermedad.", habilitada: false },
    { id: "accidentes-laborales", nombre: "Accidentes laborales", descripcion: "Accidentes de trabajo y enfermedades profesionales.", habilitada: false },
  ],
};
