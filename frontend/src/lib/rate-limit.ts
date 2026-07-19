import "server-only";

/** 10 messages/minute per session — in-memory sliding window (v1: single FE instance). */
const LIMIT = 10;
const WINDOW_MS = 60_000;

/**
 * Hard cap on distinct keys before we trigger a global sweep of expired
 * entries. Without this, an attacker rotating session/IP values (or just
 * organic growth) would let `hits` grow unbounded, since a key is only
 * removed on the rare occasion that a request to that exact key lands after
 * its entries have all expired.
 */
const SWEEP_THRESHOLD = 10_000;

const hits = new Map<string, number[]>();

/**
 * Test-only accessor for the internal Map size. Not exported from the
 * package's public surface beyond this module's tests — used to assert the
 * bounded-map behavior (keys are actually removed, not just emptied).
 */
export function _hitsSize(): number {
  return hits.size;
}

/** Test-only: clears all tracked hits so tests don't leak state into each other. */
export function _resetHitsForTests(): void {
  hits.clear();
}

/**
 * Removes every tracked key whose hits are entirely outside the current
 * window. O(n) over tracked keys; only invoked from `checkRateLimit` when
 * the map has grown past `SWEEP_THRESHOLD`, so it stays a rare, cheap
 * safety net rather than a per-call cost.
 */
export function sweepExpired(): void {
  const now = Date.now();
  for (const [key, timestamps] of hits) {
    const stillActive = timestamps.some((t) => now - t < WINDOW_MS);
    if (!stillActive) hits.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  options?: { limit?: number },
): { allowed: boolean; retryAfterSeconds?: number } {
  const limit = options?.limit ?? LIMIT;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length === 0) {
    // Every previous hit for this key (if any) has expired. Denial is
    // impossible from here (limit is always >= 1 in practice), so before we
    // push the current hit, drop the key instead of letting a stale/empty
    // array linger in the map for a key nobody is actively using.
    hits.delete(key);
  }

  if (recent.length >= limit) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }

  recent.push(now);
  hits.set(key, recent);

  if (hits.size > SWEEP_THRESHOLD) sweepExpired();

  return { allowed: true };
}
