// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieStore } = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    cookieStore: {
      jar,
      get: vi.fn((name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined)),
      set: vi.fn((name: string, value: string) => void jar.set(name, value)),
    },
  };
});

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(cookieStore) }));

import { getOrCreateSessionId, rotateSessionId, threadIdForSession } from "./session";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("session", () => {
  beforeEach(() => {
    cookieStore.jar.clear();
    vi.clearAllMocks();
  });

  it("getOrCreateSessionId reusa una cookie válida existente", async () => {
    cookieStore.jar.set("ls_session", "11111111-2222-4333-8444-555555555555");
    await expect(getOrCreateSessionId()).resolves.toBe("11111111-2222-4333-8444-555555555555");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("rotateSessionId siempre reemplaza la identidad por una nueva", async () => {
    cookieStore.jar.set("ls_session", "11111111-2222-4333-8444-555555555555");
    const rotated = await rotateSessionId();
    expect(rotated).toMatch(UUID_PATTERN);
    expect(rotated).not.toBe("11111111-2222-4333-8444-555555555555");
    // La cookie queda con el id nuevo: el próximo mensaje deriva otro thread.
    expect(cookieStore.jar.get("ls_session")).toBe(rotated);
    expect(threadIdForSession(rotated)).not.toBe(threadIdForSession("11111111-2222-4333-8444-555555555555"));
  });
});
