import { defineConfig, globalIgnores } from "eslint/config";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"]),
  coreWebVitals,
  {
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-console": ["warn", { allow: ["debug", "info", "warn", "error"] }],
      // Base rule off: it false-positives on TS type signatures.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
]);
