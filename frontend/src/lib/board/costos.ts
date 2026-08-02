/**
 * Precios por millón de tokens, en USD. Tabla al 2026-08-01 — verificar
 * contra el proveedor al cambiar de modelo.
 *
 * Un modelo ausente devuelve `null` (sin dato) y nunca 0: reportar costo cero
 * para un modelo desconocido esconde exactamente el evento que interesa ver.
 */
const PRECIOS_POR_MILLON: Record<string, { entrada: number; salida: number }> = {
  "gemini-3-flash": { entrada: 0.3, salida: 2.5 },
  "gemini-embedding-001": { entrada: 0.15, salida: 0 },
};

const UN_MILLON = 1_000_000;

/** Normaliza `google/gemini-3-flash` y `gemini-3-flash` a la misma clave. */
function normalizar(modelo: string): string {
  const partes = modelo.split("/");
  return (partes[partes.length - 1] ?? modelo).trim().toLowerCase();
}

export function estimarCostoUsd(
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number,
): number | null {
  const precio = PRECIOS_POR_MILLON[normalizar(modelo)];
  if (!precio) return null;
  return (
    (tokensEntrada / UN_MILLON) * precio.entrada + (tokensSalida / UN_MILLON) * precio.salida
  );
}
