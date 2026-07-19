import { PinoLogger } from "@mastra/loggers";

type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

const REDACTED_KEYS = [
  "password", "token", "secret", "authorization", "cookie", "apikey", "api_key",
  // Case PII (spec §8): contact data captured by registrar-caso.
  "contacto", "telefono", "email", "brief", "hechos",
];

/**
 * Recursively redacts PII/secrets from a log context object by substring-matching
 * key names (case-insensitive, at any nesting depth) against `REDACTED_KEYS`.
 * Mirrors `frontend/src/utils/logger.ts`'s `redact()`.
 *
 * Pino's own `redact` option only matches EXACT key paths (e.g. `contacto`,
 * not `contactoNombre`/`contactoEmail`), so it silently misses the actual
 * registrar-caso fields it was meant to protect. This pure function is the
 * fix, applied to every log context before it reaches Pino's serializer (see
 * `makeLogger` below).
 */
export function redactPii(context: Record<string, unknown>): Record<string, unknown> {
  return redactValue(context) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => {
        if (REDACTED_KEYS.some((k) => key.toLowerCase().includes(k))) return [key, "[REDACTED]"];
        return [key, redactValue(val)];
      }),
    );
  }
  return value;
}

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
 * PII redaction: wired via Pino's `formatters.log` hook (supported/typed by
 * `PinoLoggerOptions.formatters`, see `@mastra/loggers/dist/pino.d.ts`), NOT
 * the `redact` option (exact-path matching only — see `redactPii` doc above).
 * `formatters.log` receives exactly the merging object passed to
 * `logger.info(args, msg)` etc. (see `@mastra/loggers`' `PinoLogger.info` →
 * `this.logger.info(args, message)`) right before serialization, so running
 * `redactPii` there redacts every call through this instance. Returning a
 * plain `PinoLogger` (rather than a wrapper object) keeps this fully
 * compatible with `new Mastra({ logger: makeLogger(...) })`, and since the
 * hook lives on the underlying pino instance itself, it also covers
 * `mastra.getLogger()` / `executionContext.mastra?.getLogger()` and pino
 * child loggers (`PinoLogger.child()` inherits the parent's `formatters`
 * unless explicitly overridden) — not just direct `makeLogger(...)` callers.
 */
export function makeLogger(name: string): PinoLogger {
  return new PinoLogger({
    name,
    level: resolveLogLevel(),
    formatters: {
      log: (obj) => redactPii(obj),
    },
  });
}

/** Fallback for tool `execute` when the runtime logger is unavailable. */
export const fallbackLogger = makeLogger("Fallback");
