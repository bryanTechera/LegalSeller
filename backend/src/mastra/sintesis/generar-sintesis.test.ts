import { describe, expect, it, vi } from "vitest";

import { generarSintesis } from "./generar-sintesis.js";
import type { MaterialSintesis } from "./schema.js";

const material: MaterialSintesis = {
  caso: { categoria: "laboral", subcategorias: ["despido"], estado: "CAPTADO", resumen: null },
  mensajes: [{ rol: "user", texto: "Me despidieron sin causa después de seis años" }],
};

const objetoValido = {
  situacion: "Lo despidieron sin causa tras seis años.",
  hechos: [{ cuando: null, que: "Le comunicaron la desvinculación." }],
  datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
  pedido: "Saber qué le corresponde.",
  faltantes: ["Último salario nominal"],
};

describe("generarSintesis", () => {
  it("devuelve la síntesis validada y el modelo que la generó", async () => {
    const generar = vi.fn().mockResolvedValue({ object: objetoValido });
    const resultado = await generarSintesis(material, { generar });

    expect(resultado.status).toBe("ok");
    if (resultado.status !== "ok") return;
    expect(resultado.sintesis.situacion).toBe(objetoValido.situacion);
    expect(resultado.modelo).toContain("gemini");
  });

  it("le pasa al modelo el prompt de sistema y el material formateado", async () => {
    const generar = vi.fn().mockResolvedValue({ object: objetoValido });
    await generarSintesis(material, { generar });

    const argumentos = generar.mock.calls[0]?.[0] as { system: string; prompt: string };
    expect(argumentos.system).toContain("<rol>");
    expect(argumentos.prompt).toContain("Consultante: Me despidieron sin causa");
  });

  // Degradación graceful: el error viaja como valor. Una excepción acá tumbaría
  // el request del board y la vista del caso con él.
  it("degrada a error cuando el modelo falla, sin tirar", async () => {
    const generar = vi.fn().mockRejectedValue(new Error("gateway 503"));
    const resultado = await generarSintesis(material, { generar });

    expect(resultado).toEqual({ status: "error", mensaje: "No se pudo generar la síntesis" });
  });

  it("degrada a error cuando el modelo devuelve algo que no valida", async () => {
    const generar = vi.fn().mockResolvedValue({ object: { pedido: "sin situación" } });
    const resultado = await generarSintesis(material, { generar });

    expect(resultado.status).toBe("error");
  });
});
