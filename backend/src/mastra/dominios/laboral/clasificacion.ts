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
    "Trabaja en una casa de familia (empleada o empleado doméstico, limpieza, cuidados) — es laboral aunque el régimen doméstico no aparezca como subcategoría",
    "Es operador o teleoperador de un call center o centro de atención telefónica",
    "Pide días o le descontaron días por estudio o exámenes, casamiento, duelo, nacimiento de un hijo, controles de embarazo o cuidado de un familiar con discapacidad o enfermedad",
    "Lo mandaron al seguro de paro (subsidio por desempleo) o pregunta si le corresponde cobrarlo",
    "Reparte o maneja para una aplicación (delivery o transporte de pasajeros) — bloqueo de cuenta, pagos o condiciones de trabajo",
    "Hace teletrabajo desde su casa y el problema es de horario, desconexión o equipos",
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
    {
      id: "licencias-especiales",
      nombre: "Licencias especiales",
      descripcion:
        "Licencias especiales pagas del trabajador privado: estudio, paternidad y adopción, matrimonio, duelo, hijos con discapacidad, familiares a cargo con discapacidad o enfermedad terminal, y controles de embarazo (propios o acompañando a la pareja). La licencia anual común y el salario vacacional van por rubros-laborales.",
      habilitada: true,
    },
    {
      id: "seguro-desempleo",
      nombre: "Seguro de desempleo",
      descripcion:
        "Subsidio por desempleo del BPS (seguro de paro): quiénes acceden y por qué causales (despido, suspensión, reducción), requisitos y plazo de solicitud, monto y duración, cese del beneficio, y el despido ficto cuando la suspensión se agota sin reintegro.",
      habilitada: true,
    },
    {
      id: "teletrabajo",
      nombre: "Teletrabajo",
      descripcion:
        "Régimen del teletrabajo: acuerdo escrito y reversibilidad, jornada con límite semanal y compensación de horas, derecho a la desconexión, herramientas y equipos, seguridad e higiene en el domicilio. Aplica solo a quien trabaja fuera del local del empleador usando tecnologías de la información.",
      habilitada: true,
    },
    {
      id: "plataformas-digitales",
      nombre: "Plataformas digitales",
      descripcion:
        "Trabajo mediante plataformas digitales de reparto o de transporte de pasajeros (apps de delivery o de viajes): bloqueo o suspensión de la cuenta y decisiones automatizadas, tiempo de trabajo por logueo, retribución mínima, modalidad dependiente o autónoma. Aplica solo a quien trabaja a través de una de esas aplicaciones.",
      habilitada: true,
    },
    { id: "accidentes-laborales", nombre: "Accidentes laborales", descripcion: "Accidentes de trabajo y enfermedades profesionales.", habilitada: false },
  ],
};
