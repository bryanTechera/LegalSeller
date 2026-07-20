import { logger } from "@/utils/logger";

interface EnvCheck {
  name: string;
  required: boolean;
  hint: string;
}

const ENV_CHECKS: EnvCheck[] = [
  { name: "DATABASE_URL", required: true, hint: "Postgres connection string (shared with backend)" },
  { name: "MASTRA_BASE_URL", required: false, hint: "Agents backend URL (defaults to http://localhost:4112)" },
  { name: "REVISION_CLAVE", required: false, hint: "Clave compartida del modo revisión /revision (sin ella la feature queda apagada)" },
];

/**
 * Startup env validation, called from instrumentation.ts. Required vars
 * missing → throw with an actionable message; recommended vars missing →
 * warn and continue with defaults.
 */
export function validateEnvironment(): void {
  const missing = ENV_CHECKS.filter((check) => check.required && !process.env[check.name]);
  if (missing.length > 0) {
    const details = missing.map((check) => `${check.name} (${check.hint})`).join(", ");
    throw new Error(`Missing required environment variables: ${details}`);
  }

  for (const check of ENV_CHECKS) {
    if (!check.required && !process.env[check.name]) {
      logger.warn("Recommended env var not set, using default", { name: check.name, hint: check.hint });
    }
  }
}
