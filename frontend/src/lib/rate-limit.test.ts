import { beforeEach, describe, expect, it, vi } from "vitest";

import { _hitsSize, _resetHitsForTests, checkRateLimit, sweepExpired } from "./rate-limit";

describe("checkRateLimit", () => {
  // Tests share the module-level `hits` map; reset it so one test's keys
  // can't be mistaken for expired by a later test's advanced fake clock.
  beforeEach(() => {
    _resetHitsForTests();
  });

  it("permite hasta el límite y después rechaza con retryAfter", () => {
    vi.useFakeTimers();
    const key = "sess-test-1";
    for (let i = 0; i < 10; i++) expect(checkRateLimit(key).allowed).toBe(true);
    const denied = checkRateLimit(key);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(key).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("respeta un límite personalizado vía options.limit (31º rechazado con límite 30)", () => {
    vi.useFakeTimers();
    const key = "ip-test-custom-limit";
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit(key, { limit: 30 }).allowed).toBe(true);
    }
    const denied = checkRateLimit(key, { limit: 30 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("sweepExpired() elimina claves cuyas entradas quedaron todas fuera de la ventana", () => {
    vi.useFakeTimers();
    const staleKey = "sess-stale-sweep-key";
    const freshKey = "sess-fresh-sweep-key";

    checkRateLimit(staleKey);
    const sizeAfterStale = _hitsSize();

    // Move past the window, then touch a *different* key so it's the one
    // that stays live.
    vi.advanceTimersByTime(61_000);
    checkRateLimit(freshKey);
    const sizeAfterFresh = _hitsSize();
    expect(sizeAfterFresh).toBe(sizeAfterStale + 1);

    sweepExpired();

    // Only `staleKey` (all entries outside the window) should be dropped;
    // `freshKey` (just added) stays.
    expect(_hitsSize()).toBe(sizeAfterFresh - 1);
    vi.useRealTimers();
  });
});
