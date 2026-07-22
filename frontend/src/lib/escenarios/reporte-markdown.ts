import type { Corrida } from "./schema";

/** Render legible de una corrida (el .json es la fuente de análisis). */
export function renderCorridaMarkdown(corrida: Corrida): string {
  const lineas: string[] = [
    `# Corrida — ${corrida.titulo}`,
    "",
    `- Escenario: \`${corrida.escenario}\``,
    `- Entorno: ${corrida.url}`,
    `- Sesión: ${corrida.sesionId}`,
    `- Inicio: ${corrida.inicio}`,
    "",
  ];
  for (const turno of corrida.turnos) {
    lineas.push(`## Turno ${String(turno.n)} (${turno.origen})`, "", `**Usuario:** ${turno.usuario}`, "");
    for (const call of turno.toolCalls) {
      lineas.push(`- tool \`${call.toolName}\` → \`${JSON.stringify(call.args)}\``);
    }
    if (turno.toolCalls.length > 0) lineas.push("");
    lineas.push(`**Asistente:** ${turno.respuesta}`, "");
    if (turno.error !== undefined) lineas.push(`**Error del turno:** ${turno.error}`, "");
    lineas.push(
      `_Latencia: primer byte ${String(turno.latenciaPrimerByteMs)} ms · total ${String(turno.latenciaTotalMs)} ms_`,
      "",
    );
  }
  lineas.push("## Expectativas", "");
  if (corrida.expectativas.length === 0) {
    lineas.push("(sin expectativas declaradas)", "");
  } else {
    lineas.push("| Clave | Esperado | Obtenido | Resultado |", "|---|---|---|---|");
    for (const resultado of corrida.expectativas) {
      lineas.push(
        `| ${resultado.clave} | ${JSON.stringify(resultado.esperado)} | ${JSON.stringify(resultado.obtenido)} | ${resultado.cumplida ? "CUMPLIDA" : "INCUMPLIDA"} |`,
      );
    }
    lineas.push("");
  }
  lineas.push("## Caso", "");
  if (corrida.caso === null) {
    lineas.push("(sin caso registrado)", "");
  } else {
    lineas.push("```json", JSON.stringify(corrida.caso, null, 2), "```", "");
  }
  return lineas.join("\n");
}
