import { describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
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
});
