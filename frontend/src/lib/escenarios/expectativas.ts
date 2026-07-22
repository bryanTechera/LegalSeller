import type { CasoCorrida, ExpectativaResultado, Expectativas, TurnoCorrida } from "./schema";

/**
 * Evalúa las expectativas declaradas del escenario contra la corrida.
 * Informativo, nunca gate: el resultado se reporta, no corta nada
 * (el gate de regresión del proyecto es pnpm evals).
 */
export function evaluarExpectativas(
  expectativas: Expectativas | undefined,
  turnos: TurnoCorrida[],
  caso: CasoCorrida | null,
): ExpectativaResultado[] {
  if (!expectativas) return [];
  const resultados: ExpectativaResultado[] = [];
  const toolCalls = turnos.flatMap((turno) => turno.toolCalls);

  if (expectativas.clasificacion) {
    const esperado = expectativas.clasificacion;
    const asignacion = toolCalls.find((call) => call.toolName === "asignar-clasificacion");
    const obtenido = asignacion
      ? { categoria: asignacion.args.categoria, subcategoria: asignacion.args.subcategoria }
      : null;
    const cumplida =
      obtenido !== null &&
      obtenido.categoria === esperado.categoria &&
      (esperado.subcategoria === undefined || obtenido.subcategoria === esperado.subcategoria);
    resultados.push({ clave: "clasificacion", esperado, obtenido, cumplida });
  }
  if (expectativas.llamoBuscarDocumentos !== undefined) {
    const obtenido = toolCalls.some((call) => call.toolName === "buscar-documentos");
    resultados.push({
      clave: "llamoBuscarDocumentos",
      esperado: expectativas.llamoBuscarDocumentos,
      obtenido,
      cumplida: obtenido === expectativas.llamoBuscarDocumentos,
    });
  }
  if (expectativas.casoCaptado !== undefined) {
    const obtenido = caso?.estado === "CAPTADO";
    resultados.push({
      clave: "casoCaptado",
      esperado: expectativas.casoCaptado,
      obtenido,
      cumplida: obtenido === expectativas.casoCaptado,
    });
  }
  if (expectativas.contactoRegistrado !== undefined) {
    const obtenido = Boolean(caso && (caso.contactoNombre ?? caso.contactoTelefono ?? caso.contactoEmail));
    resultados.push({
      clave: "contactoRegistrado",
      esperado: expectativas.contactoRegistrado,
      obtenido,
      cumplida: obtenido === expectativas.contactoRegistrado,
    });
  }
  return resultados;
}
