import { PinoLogger } from "@mastra/loggers";

type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const REDACTED_KEYS = [
  "password", "token", "secret", "authorization", "cookie", "apikey", "api_key",
  // Case PII (spec §8): contact data captured by registrar-caso.
  "contacto", "telefono", "email", "brief", "hechos",
];

function resolveLogLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  if (raw !== undefined && (VALID_LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }
  return "info";
}

/**
 * Single factory for loggers outside the Mastra runtime (services, config,
 * scripts). Inside tools and workflow steps use
 * `executionContext.mastra?.getLogger()` instead.
 *
 * PII redaction: Pino's redact option redacts matched keys at all levels.
 * Tool payload redaction is enforced at orchestrator level (never manually log tool payloads).
 */
export function makeLogger(name: string): PinoLogger {
  return new PinoLogger({
    name,
    level: resolveLogLevel(),
    redact: REDACTED_KEYS,
  });
}

/** Fallback for tool `execute` when the runtime logger is unavailable. */
export const fallbackLogger = makeLogger("Fallback");
