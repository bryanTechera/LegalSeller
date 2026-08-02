import { describe, expect, it } from "vitest";

import { isAllowed, parseAllowedEmails } from "./allowlist";

describe("parseAllowedEmails", () => {
  it("separa por comas, normaliza a minúsculas y descarta vacíos", () => {
    expect(parseAllowedEmails(" Ana@Jurco.uy , bruno@jurco.uy ,, ")).toEqual([
      "ana@jurco.uy",
      "bruno@jurco.uy",
    ]);
  });

  it("lista ausente devuelve array vacío", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
  });
});

describe("isAllowed", () => {
  it("acepta un email de la lista sin importar mayúsculas ni espacios", () => {
    expect(isAllowed("  Ana@Jurco.uy ", "ana@jurco.uy,bruno@jurco.uy")).toBe(true);
  });

  it("rechaza un email que no está en la lista", () => {
    expect(isAllowed("intruso@example.com", "ana@jurco.uy")).toBe(false);
  });

  // Fail-closed: una env faltante en producción NUNCA debe abrir el board.
  it("lista vacía deniega todo", () => {
    expect(isAllowed("ana@jurco.uy", "")).toBe(false);
    expect(isAllowed("ana@jurco.uy", undefined)).toBe(false);
  });

  it("email nulo o vacío es rechazado", () => {
    expect(isAllowed(null, "ana@jurco.uy")).toBe(false);
    expect(isAllowed("", "ana@jurco.uy")).toBe(false);
  });
});
