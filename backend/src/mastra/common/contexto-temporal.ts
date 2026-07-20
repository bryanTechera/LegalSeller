/**
 * Volatile block with the current date, injected per request by the domain
 * composers. Without it the model resolves relative dates ("este año", "hace
 * tres meses") against its training prior — found live: an "este año" dismissal
 * got registered two years off, which corrupts antigüedad and indemnización.
 */
export function bloqueContextoTemporal(now: Date = new Date()): string {
  const fecha = new Intl.DateTimeFormat("es-UY", {
    dateStyle: "full",
    timeZone: "America/Montevideo",
  }).format(now);
  return `\n\n<contexto_temporal>\nHoy es ${fecha} (Uruguay). Usá esta fecha para resolver toda referencia temporal relativa del usuario ("este año", "el mes pasado", "hace tres meses") y para calcular antigüedades y plazos.\n</contexto_temporal>`;
}
