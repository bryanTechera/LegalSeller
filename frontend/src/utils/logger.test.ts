import { describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

describe("logger PII redaction", () => {
  it("redacta campos de contacto del caso", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logger.info("caso", { contactoNombre: "Ana", contactoTelefono: "099", contactoEmail: "a@b.c", telefono: "1", email: "x@y.z" });
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain("Ana");
    expect(line).not.toContain("099");
    expect(line).not.toContain("a@b.c");
    spy.mockRestore();
  });
});
