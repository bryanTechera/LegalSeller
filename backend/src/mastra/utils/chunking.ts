export interface TextChunk {
  /** Chunk text content. */
  content: string;
  /** 0-based position of the chunk within the document. */
  position: number;
}

export interface ChunkOptions {
  /** Target chunk size in characters. */
  chunkSize?: number;
  /** Overlap between consecutive chunks, in characters. */
  overlap?: number;
}

const DEFAULT_CHUNK_SIZE = 2000;
const DEFAULT_OVERLAP = 200;

/**
 * Splits a document into overlapping chunks, preferring paragraph and
 * sentence boundaries over hard cuts. Legal documents are long and structured;
 * keeping boundaries intact preserves citable units (articles, clauses).
 *
 * Deliberately simple for the MVP — calibrate size/overlap with evals against
 * real domain documents before adding complexity.
 */
export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  if (chunkSize <= 0) throw new Error("chunkSize must be positive");
  if (overlap < 0 || overlap >= chunkSize) throw new Error("overlap must be in [0, chunkSize)");

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= chunkSize) {
    return [{ content: normalized, position: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let position = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      // Prefer cutting at a paragraph break, then at a sentence end.
      const paragraphBreak = slice.lastIndexOf("\n\n");
      const sentenceEnd = slice.lastIndexOf(". ");
      const cutAt = paragraphBreak > chunkSize / 2 ? paragraphBreak : sentenceEnd > chunkSize / 2 ? sentenceEnd + 1 : -1;
      if (cutAt > 0) {
        end = start + cutAt;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({ content, position });
      position += 1;
    }

    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
