/**
 * Classification data for the arrendamiento-desalojo domain, consumed by the
 * registry. Taxonomy source of truth: docs/dominio-consultas.md. Habilitada el
 * 2026-07-31 con el material del equipo legal (síntesis de arrendamientos
 * urbanos y desalojo, actualizada al 19/07/2026; ver
 * docs/plans/2026-07-31-procesamiento-arrendamientos.md).
 *
 * Nota: la subcategoría que la taxonomía original llamaba "Desalojo ley 19980"
 * se habilita como desalojo-ley-19889 — el equipo legal confirmó el 2026-08-03
 * que "19980" era un error de tipeo y la ley correcta es la 19.889
 * (docs/preguntas-legales/2026-07-31-arrendamientos.md, RESPONDIDA).
 *
 * arrendamiento-rural se habilitó el 2026-08-03 con el texto del Decreto-Ley
 * 14.384 enviado por el equipo legal (respuesta 8 del mismo archivo);
 * confirmación del encuadre pedida en
 * docs/preguntas-legales/2026-08-03-arrendamientos-rurales.md.
 */
export const arrendamientoDesalojoClasificacion = {
  id: "arrendamiento-desalojo" as const,
  nombre: "Arrendamiento y desalojo",
  descripcion:
    "Alquileres de inmuebles urbanos y rurales y recuperación de la tenencia: contratos de alquiler y sus garantías, desalojos por vencimiento o falta de pago, ocupantes sin contrato (comodato, precario), lanzamientos, cobro de alquileres y arrendamientos de campos para explotación agropecuaria.",
  seniales: [
    "Menciona un alquiler, un inquilino, un arrendador, una garantía de alquiler o una inmobiliaria",
    "Habla de un desalojo, un lanzamiento, un cedulón o una orden de dejar un inmueble",
    "Debe o le deben alquileres, o tiene problemas con el contrato de alquiler",
    "Alguien ocupa una vivienda prestada o sin contrato y quieren recuperarla, o quieren sacarlo",
    "Arrienda o da en arriendo un campo, chacra o predio rural (agricultura, ganadería, pastoreo, aparcería)",
  ],
  habilitada: true,
  subcategorias: [
    {
      id: "contrato-de-alquiler",
      nombre: "Contrato de alquiler",
      descripcion:
        "Formación y contenido del contrato de alquiler: plazo y renovación, precio, moneda y reajuste, garantías y depósitos, reparaciones y gastos, subarrendamiento, cesión, inspecciones y venta del inmueble alquilado.",
      habilitada: true,
    },
    {
      id: "desalojo-ley-8153",
      nombre: "Desalojo ley 8153",
      descripcion:
        "Desalojo en libre contratación (Ley 8.153): casa habitación excluida del estatuto protector y, desde 2026, industria, comercio y demás destinos no habitacionales; desalojo por vencimiento del plazo contractual.",
      habilitada: true,
    },
    {
      id: "desalojo-ley-14219",
      nombre: "Desalojo ley 14219",
      descripcion:
        "Desalojo bajo el régimen estatutario (Decreto-Ley 14.219): buen y mal pagador, arrendamiento por temporada, comodato y precario, vivienda vinculada al empleo, ex concubino, abandono, finca ruinosa y demás causales del decreto-ley.",
      habilitada: true,
    },
    {
      id: "desalojo-ley-19889",
      nombre: "Desalojo ley 19889",
      descripcion:
        "Desalojo del régimen especial de arrendamiento sin garantía (Ley 19.889): requisitos del régimen, desalojo por vencimiento y por mal pagador con plazos abreviados, clausura y prórrogas propias.",
      habilitada: true,
    },
    {
      id: "cobro-alquileres",
      nombre: "Cobro alquileres",
      descripcion:
        "Cobro de alquileres, consumos y tributos adeudados: proceso ejecutivo, embargo, acumulación con el desalojo y deuda posterior a la entrega del inmueble.",
      habilitada: true,
    },
    {
      id: "arrendamiento-rural",
      nombre: "Arrendamiento rural",
      descripcion:
        "Arrendamientos, aparcerías y pastoreos de predios rurales con destino agrícola, pecuario o agropecuario (Decreto-Ley 14.384): contrato escrito e inscripción, precio y mejoras, desalojo y entrega del predio rural. El desalojo del trabajador rural despedido que ocupa la vivienda del establecimiento es tema laboral, no de esta subcategoría.",
      habilitada: true,
    },
  ],
};
