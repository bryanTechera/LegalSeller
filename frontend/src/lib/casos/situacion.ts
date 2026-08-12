/**
 * La `situacion` de una síntesis guardada. El Json de Postgres no está tipado
 * y acá no se valida el objeto entero a propósito: los listados solo muestran
 * este campo, y una síntesis vieja a la que le falte otro no tiene por qué
 * desaparecer de la tabla. La validación completa vive en `asegurarSintesis`.
 *
 * Sin `server-only`: es lectura pura de un Json, sin acceso a base ni a
 * secretos, y así puede testearse suelto.
 */
export function situacionDe(contenido: unknown): string | null {
  if (contenido === null || typeof contenido !== "object") return null;
  const situacion = (contenido as { situacion?: unknown }).situacion;
  return typeof situacion === "string" && situacion.trim() !== "" ? situacion : null;
}
