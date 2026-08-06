import { describe, expect, it } from "vitest";

import { bloqueEstadoCaptacion } from "./estado-captacion.js";

describe("bloqueEstadoCaptacion", () => {
  it("sin señales no inyecta bloque", () => {
    expect(bloqueEstadoCaptacion({ userId: "s1" })).toBe("");
    expect(bloqueEstadoCaptacion(null)).toBe("");
  });

  it("con el pedido hecho y sin respuesta, prohíbe volver a mencionarlo", () => {
    const bloque = bloqueEstadoCaptacion({ userId: "s1", pedidoContactoHecho: true });
    expect(bloque).toContain("<estado_captacion>");
    expect(bloque).toContain("no lo respondió");
  });

  it("con contacto registrado no le afirma al modelo que el usuario no respondió", () => {
    const bloque = bloqueEstadoCaptacion({ userId: "s1", contactoRegistrado: true });
    expect(bloque).toContain("ya están registrados");
    expect(bloque).not.toContain("no lo respondió");
  });

  it("tener el contacto manda sobre haberlo pedido", () => {
    const bloque = bloqueEstadoCaptacion({ userId: "s1", pedidoContactoHecho: true, contactoRegistrado: true });
    expect(bloque).toContain("ya están registrados");
  });
});
