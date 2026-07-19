import { PinoLogger } from "@mastra/loggers";

type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

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
 */
export function makeLogger(name: string): PinoLogger {
  return new PinoLogger({ name, level: resolveLogLevel() });
}

/** Fallback for tool `execute` when the runtime logger is unavailable. */
export const fallbackLogger = makeLogger("Fallback");
