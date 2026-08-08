import { describe, expect, it } from "vitest";

import { calcularHuella, type EntradaHuella } from "./huella";

const base: EntradaHuella = {
  promptVersion: "1",
  modelo: "google/gemini-3.5-flash-lite",
  mensajes: { cantidad: 4, ultimoId: "msg-4", ultimaFecha: "2026-08-08T10:00:00.000Z" },
  caso: {
    categoria: "laboral",
    subcategorias: ["despido", "rubros-laborales"],
    resumen: { brief: "Despido sin causa", hechos: "6 años de antigüedad" },
    contactoNombre: "Ana",
    contactoTelefono: null,
    contactoEmail: "ana@example.com",
    estado: "CAPTADO",
  },
};

describe("calcularHuella", () => {
  it("es estable para la misma entrada", () => {
    expect(calcularHuella(base)).toBe(calcularHuella(structuredClone(base)));
  });

  // El orden de las subcategorías depende de un Set y del orden en que las
  // mandó el agente. Si moviera la huella, cada turno regeneraría la síntesis
  // sin que haya cambiado nada.
  it("no depende del orden de las subcategorías", () => {
    const invertido = { ...base, caso: { ...base.caso, subcategorias: ["rubros-laborales", "despido"] } };
    expect(calcularHuella(invertido)).toBe(calcularHuella(base));
  });

  it("cambia con un mensaje nuevo", () => {
    const conTurno = { ...base, mensajes: { cantidad: 5, ultimoId: "msg-5", ultimaFecha: "2026-08-08T10:05:00.000Z" } };
    expect(calcularHuella(conTurno)).not.toBe(calcularHuella(base));
  });

  it("cambia con un dato de contacto nuevo", () => {
    const conTelefono = { ...base, caso: { ...base.caso, contactoTelefono: "099111222" } };
    expect(calcularHuella(conTelefono)).not.toBe(calcularHuella(base));
  });

  it("cambia con la versión del prompt y con el modelo", () => {
    expect(calcularHuella({ ...base, promptVersion: "2" })).not.toBe(calcularHuella(base));
    expect(calcularHuella({ ...base, modelo: "otro/modelo" })).not.toBe(calcularHuella(base));
  });

  it("cambia con el resumen crudo que dejaron los agentes", () => {
    const conHechos = { ...base, caso: { ...base.caso, resumen: { brief: "Despido sin causa", hechos: "otra cosa" } } };
    expect(calcularHuella(conHechos)).not.toBe(calcularHuella(base));
  });

  // El resumen viene de un Json de Postgres: el driver puede devolver las
  // mismas claves en otro orden, y JSON.stringify preserva el orden de
  // inserción. Sin `ordenarClaves`, el mismo contenido regeneraría la síntesis
  // en cada apertura. (La otra mitad de ese invariante —que un timestamp de
  // escritura nunca entre a la huella— la sostiene el tipo `EntradaHuella`,
  // que no tiene por dónde recibirlo; ver el comentario de `calcularHuella`.)
  it("no depende del orden de las claves del resumen", () => {
    const invertido = {
      ...base,
      caso: { ...base.caso, resumen: { hechos: "6 años de antigüedad", brief: "Despido sin causa" } },
    };
    expect(calcularHuella(invertido)).toBe(calcularHuella(base));
  });
});
