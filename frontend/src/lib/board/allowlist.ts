/**
 * Allowlist de acceso al board. Fail-closed por diseño: una lista vacía o
 * ausente deniega a todos, para que una env faltante en producción nunca
 * termine abriendo el board en vez de cerrarlo.
 */
export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(
  email: string | null | undefined,
  raw: string | undefined = process.env.ALLOWED_EMAILS,
): boolean {
  const permitidos = parseAllowedEmails(raw);
  if (permitidos.length === 0) return false;
  const candidato = (email ?? "").trim().toLowerCase();
  if (!candidato) return false;
  return permitidos.includes(candidato);
}
