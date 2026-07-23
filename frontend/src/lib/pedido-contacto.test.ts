import { describe, expect, it } from "vitest";

import { contienePedidoContacto } from "./pedido-contacto";

describe("contienePedidoContacto", () => {
  // Formulaciones tomadas de corridas y sesiones reales.
  it.each([
    "Si te parece bien, dejame tu nombre y un teléfono de contacto así un abogado revisa tu caso.",
    "dejame tu nombre y un número de teléfono (o mail) y te ponemos en contacto.",
    "pasame tu nombre y un teléfono o correo y nos ponemos en contacto con vos.",
    "¿Me dejarías un teléfono de contacto y tu nombre?",
    "Si me dejás tu nombre y un teléfono, hacemos que un abogado te llame.",
    "¿Me compartís tus datos de contacto?",
  ])("detecta el pedido: %s", (texto) => {
    expect(contienePedidoContacto(texto)).toBe(true);
  });

  it.each([
    "El plazo es de un año desde el cese; contame la fecha del despido y lo dimensionamos.",
    "Eso lo va a evaluar el abogado que tome tu caso.",
    "Podés presentarte en el Ministerio de Trabajo para pedir la audiencia de conciliación.",
  ])("no marca respuestas sin pedido: %s", (texto) => {
    expect(contienePedidoContacto(texto)).toBe(false);
  });
});
