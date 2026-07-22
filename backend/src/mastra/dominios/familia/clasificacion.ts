/**
 * Classification data for the familia domain, consumed by the registry.
 * Taxonomy source of truth: docs/dominio-consultas.md. Habilitada el
 * 2026-07-22 con el material del equipo legal (síntesis de derecho de
 * familia + textos consolidados; ver
 * docs/plans/2026-07-22-procesamiento-familia.md).
 */
export const familiaClasificacion = {
  id: "familia" as const,
  nombre: "Familia",
  descripcion:
    "Asuntos de familia: divorcio y separación, tenencia y visitas, pensión alimenticia, unión concubinaria, sucesiones, violencia de género o doméstica, adopción, filiación y cambios registrales (nombre, identidad de género).",
  seniales: [
    "Menciona divorcio, separación, matrimonio o una ex pareja",
    "Habla de hijos: tenencia, visitas, pensión alimenticia o retención de un niño",
    "Relata violencia de la pareja o en la familia, una denuncia o medidas de protección",
    "Menciona concubinato, herencia, adopción o un cambio de nombre o sexo registral",
  ],
  habilitada: true,
  subcategorias: [
    {
      id: "pension-tenencia-visitas",
      nombre: "Pensión alimenticia, tenencia y visitas",
      descripcion:
        "Fijación, aumento, reducción, cese o incumplimiento de la pensión alimenticia; tenencia compartida o alternada; régimen de visitas y su incumplimiento.",
      habilitada: true,
    },
    {
      id: "divorcio-sociedad-conyugal",
      nombre: "Divorcio, sociedad conyugal",
      descripcion:
        "Divorcio por sola voluntad, mutuo consentimiento o causal; separación; pensión entre cónyuges; disolución y liquidación de la sociedad conyugal.",
      habilitada: true,
    },
    {
      id: "sucesiones",
      nombre: "Sucesiones",
      descripcion:
        "Herencias: apertura de la sucesión, declaratoria de herederos, inventario y partición de bienes.",
      habilitada: true,
    },
    {
      id: "union-concubinaria",
      nombre: "Unión concubinaria",
      descripcion:
        "Reconocimiento judicial del concubinato, efectos patrimoniales y disolución de la unión.",
      habilitada: true,
    },
    {
      id: "violencia-de-genero",
      nombre: "Violencia de género",
      descripcion:
        "Violencia basada en género o doméstica: denuncia, medidas de protección y sus efectos sobre tenencia, visitas y alimentos.",
      habilitada: true,
    },
  ],
};
