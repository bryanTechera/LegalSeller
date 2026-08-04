/** What the sync must do with one corpus file. */
export type AccionSync = "saltar" | "reingestar" | "reembeber";

/** Fingerprints currently stored for a Document row. */
export interface EstadoEnBase {
  contentHash: string | null;
  pipelineVersion: string | null;
}

interface PartesDeVersion {
  /** modelo|taskType — a change here is fixable from stored chunk text. */
  embed: string;
  /** chunkSize:overlap — a change here moves chunk boundaries, so it needs the file. */
  chunk: string;
}

function partesDeVersion(version: string): PartesDeVersion | null {
  const partes = version.split("|");
  if (partes.length !== 3) return null;
  return { embed: `${partes[0]}|${partes[1]}`, chunk: partes[2] };
}

/**
 * Decides what to do with a corpus file given what the database already holds.
 * "reembeber" is only reachable when the chunking half of the fingerprint is
 * unchanged: stored chunks are reusable as text only if their boundaries still
 * match the current chunker. Anything ambiguous falls back to "reingestar",
 * which is always correct (just more expensive).
 */
export function decidirAccion(
  base: EstadoEnBase | null,
  hashArchivo: string,
  versionActual: string,
): AccionSync {
  if (base === null || base.contentHash === null || base.contentHash !== hashArchivo) return "reingestar";
  if (base.pipelineVersion === versionActual) return "saltar";

  const enBase = base.pipelineVersion === null ? null : partesDeVersion(base.pipelineVersion);
  const actual = partesDeVersion(versionActual);
  if (!enBase || !actual || enBase.chunk !== actual.chunk) return "reingestar";
  return "reembeber";
}
