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
      // No-op key: config/embedding.ts throws at import time if unset, which
      // breaks any test that transitively imports it. Unit tests never call
      // generateEmbedding for real, so the key value itself is irrelevant.
      GOOGLE_GENERATIVE_AI_API_KEY: "test-key-not-used",
    },
  },
});
