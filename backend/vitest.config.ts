import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      // No-op DATABASE_URL: unit tests never hit a real database.
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      // Prevents Mastra storage.init() from firing ECONNREFUSED as an
      // unhandled rejection when modules import the Mastra instance.
      MASTRA_DISABLE_STORAGE_INIT: "true",
    },
  },
});
