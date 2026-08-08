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

  // El caso de regresión del spec §5.1: guardar la síntesis no puede mover la
  // huella, o cada apertura regeneraría para siempre. El diseño lo previene por
  // construcción — `EntradaHuella` no tiene por dónde recibir un timestamp de
  // escritura — y este test lo deja fijado: si alguien agrega `updatedAt` al
  // tipo, deja de compilar acá.
  it("no admite timestamps de escritura en la entrada", () => {
    const claves = Object.keys(base.caso);
    expect(claves).not.toContain("updatedAt");
    expect(claves).not.toContain("actualizadoEn");
  });
});
