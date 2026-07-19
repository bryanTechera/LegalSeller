type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

const REDACTED_KEYS = ["password", "token", "secret", "authorization", "cookie", "apikey", "api_key"];

function resolveMinLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVEL_ORDER[raw as LogLevel] ?? LEVEL_ORDER.info;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => {
        if (REDACTED_KEYS.some((k) => key.toLowerCase().includes(k))) return [key, "[REDACTED]"];
        return [key, redact(val)];
      }),
    );
  }
  return value;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < resolveMinLevel()) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "fatal") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

/**
 * Structured JSON logger (stdout/stderr, Railway-friendly) with PII redaction.
 * Never use console.log directly in src/.
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
  fatal: (message: string, context?: Record<string, unknown>) => emit("fatal", message, context),
};
