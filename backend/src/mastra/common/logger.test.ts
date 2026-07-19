import { describe, expect, it } from "vitest";

import { fallbackLogger, makeLogger, redactPii } from "./logger.js";

describe("redactPii", () => {
  it("redacta contactoNombre y contactoEmail anidado (registrar-caso PII)", () => {
    const input = {
      contactoNombre: "Ana",
      payload: { contactoEmail: "a@b.c" },
    };

    const output = redactPii(input);

    expect(output).toEqual({
      contactoNombre: "[REDACTED]",
      payload: { contactoEmail: "[REDACTED]" },
    });
  });

  it("redacta claves sensibles case-insensitive en cualquier profundidad, incluyendo arrays", () => {
    const input = {
      Password: "hunter2",
      nested: {
        list: [{ apiKey: "secret-key" }, { safe: "ok" }],
        telefonoContacto: "+598 99 999 999",
      },
      brief: "hechos del caso...",
      safeKey: "unaffected",
    };

    const output = redactPii(input);

    expect(output).toEqual({
      Password: "[REDACTED]",
      nested: {
        list: [{ apiKey: "[REDACTED]" }, { safe: "ok" }],
        telefonoContacto: "[REDACTED]",
      },
      brief: "[REDACTED]",
      safeKey: "unaffected",
    });
  });

  it("no toca objetos/arrays sin claves sensibles", () => {
    const input = { a: 1, b: { c: [1, 2, 3] } };
    expect(redactPii(input)).toEqual(input);
  });
});

/**
 * Pino stores its `formatters` under the well-known global symbol
 * `Symbol.for('pino.formatters')` (see pino's lib/symbols.js). Reading it
 * back via `Symbol.for` (no import of the `pino` package needed — it's not
 * a direct dependency here, @mastra/loggers owns it transitively) lets us
 * verify the exact hook `makeLogger` wires up, invoked the same way pino's
 * serializer invokes it (`formatters.log(mergingObject)`), without depending
 * on pino-pretty's colorized stdout output.
 */
function getPinoLogFormatter(logger: ReturnType<typeof makeLogger>): (obj: Record<string, unknown>) => unknown {
  const pinoInstance = (logger as unknown as { logger: object }).logger;
  const formattersSym = Symbol.for("pino.formatters");
  const formatters = (
    pinoInstance as Partial<Record<symbol, { log?: (obj: Record<string, unknown>) => unknown }>>
  )[formattersSym];
  const log = formatters?.log;
  if (!log) throw new Error("expected pino instance to have a formatters.log hook wired up");
  return log;
}

describe("makeLogger", () => {
  it("wires formatters.log to redactPii on the underlying pino instance", () => {
    const logger = makeLogger("Test");
    const logFormatter = getPinoLogFormatter(logger);

    const result = logFormatter({
      contactoNombre: "Ana",
      payload: { contactoEmail: "a@b.c" },
    });

    expect(result).toEqual({
      contactoNombre: "[REDACTED]",
      payload: { contactoEmail: "[REDACTED]" },
    });
  });

  it("no rompe cuando el logger real loguea con contexto conteniendo PII", () => {
    const logger = makeLogger("Test");
    expect(() => {
      logger.info("evento de prueba", {
        contactoNombre: "Ana",
        payload: { contactoEmail: "a@b.c" },
      });
    }).not.toThrow();
  });
});

describe("fallbackLogger", () => {
  it("es un logger utilizable (no tira al loguear con contexto con PII)", () => {
    expect(() => {
      fallbackLogger.info("mensaje de prueba", { contactoEmail: "a@b.c" });
    }).not.toThrow();
  });
});
