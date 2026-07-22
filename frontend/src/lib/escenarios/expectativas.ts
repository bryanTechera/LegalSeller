import type { CasoCorrida, ExpectativaResultado, Expectativas, TurnoCorrida } from "./schema";

/** Clasificación registrada en el audit trail del Caso (evento CLASIFICACION). */
function clasificacionDeEventos(caso: CasoCorrida | null): { categoria: unknown; subcategoria: unknown } | null {
  const evento = caso?.eventos.find((candidato) => candidato.tipo === "CLASIFICACION");
  if (!evento || evento.payload === null || typeof evento.payload !== "object") return null;
  const payload = evento.payload as Record<string, unknown>;
  return { categoria: payload.categoria, subcategoria: payload.subcategoria };
}

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
    // El SSE que llega al cliente NUNCA trae asignar-clasificacion: el BFF
    // consume el stream del receptor internamente y re-streamea el turno del
    // agente de categoría (descubierto en la primera corrida contra prod,
    // 2026-07-22). La clasificación observable es el CasoEvento CLASIFICACION;
    // el tool-call queda como primera opción para corridas directas al agente.
    const asignacion = toolCalls.find((call) => call.toolName === "asignar-clasificacion");
    const obtenido = asignacion
      ? { categoria: asignacion.args.categoria, subcategoria: asignacion.args.subcategoria }
      : clasificacionDeEventos(caso);
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
