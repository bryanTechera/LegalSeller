import "@testing-library/jest-dom/vitest";

import { afterEach, vi } from "vitest";

// jsdom does not persist storage between tests; explicit mock keeps store
// tests (zustand persist) deterministic.
const storage = new Map<string, string>();
const storageMock: Storage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => void storage.delete(key),
  setItem: (key, value) => void storage.set(key, String(value)),
};
Object.defineProperty(globalThis, "sessionStorage", { value: storageMock });
Object.defineProperty(globalThis, "localStorage", { value: storageMock });

afterEach(() => {
  storage.clear();
  vi.clearAllMocks();
});
