import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["tests/**", "node_modules/**"],
    setupFiles: "./vitest.setup.ts",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/*.config.*", "**/*.d.ts", "src/types/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // "server-only" throws unconditionally unless resolved under Next's
      // "react-server" export condition (not set in Vitest's jsdom env).
      // Alias to its own no-op sibling so server-side lib modules (Prisma
      // singleton, session/classification helpers) can be imported in tests.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
});
