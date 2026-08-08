import { describe, expect, it, vi } from "vitest";

import { manejarPedidoDeSintesis } from "./manejar-pedido-sintesis.js";
import type { MaterialSintesis } from "./schema.js";

const material: MaterialSintesis = {
  caso: {
    categoria: "laboral",
    subcategorias: ["despido"],
    estado: "CAPTADO",
    resumen: null,
    abiertoEn: "2026-08-08T13:00:00.000Z",
  },
  mensajes: [
    { rol: "user", texto: "Me despidieron sin causa después de seis años", fecha: "2026-08-08T13:00:00.000Z" },
  ],
};

const sintesisOk = {
  status: "ok" as const,
  sintesis: {
    situacion: "Lo despidieron sin causa.",
    hechos: [],
    datosClave: [],
    pedido: "Saber qué le corresponde.",
    faltantes: [],
  },
  modelo: "google/gemini-3.5-flash-lite",
};

describe("manejarPedidoDeSintesis", () => {
  it("devuelve 400 y Material inválido cuando el body no es JSON válido", async () => {
    const leerBody = vi.fn().mockRejectedValue(new SyntaxError("Unexpected token"));
    const { resultado, status } = await manejarPedidoDeSintesis(leerBody);

    expect(status).toBe(400);
    expect(resultado).toEqual({ status: "error", mensaje: "Material inválido" });
  });

  it("devuelve 400 y Material inválido cuando el body es JSON vacío ({})", async () => {
    const leerBody = vi.fn().mockResolvedValue({});
    const { resultado, status } = await manejarPedidoDeSintesis(leerBody);

    expect(status).toBe(400);
    expect(resultado).toEqual({ status: "error", mensaje: "Material inválido" });
  });

  it("devuelve 400 cuando el body es JSON válido pero no cumple materialSchema", async () => {
    const leerBody = vi.fn().mockResolvedValue({ caso: { categoria: "laboral" } });
    const { resultado, status } = await manejarPedidoDeSintesis(leerBody);

    expect(status).toBe(400);
    expect(resultado).toEqual({ status: "error", mensaje: "Material inválido" });
  });

  it("devuelve 200 con el resultado de generarSintesis cuando el material es válido", async () => {
    const leerBody = vi.fn().mockResolvedValue(material);
    const generarSintesis = vi.fn().mockResolvedValue(sintesisOk);
    const { resultado, status } = await manejarPedidoDeSintesis(leerBody, { generarSintesis });

    expect(status).toBe(200);
    expect(resultado).toEqual(sintesisOk);
    expect(generarSintesis).toHaveBeenCalledWith(material);
  });

  it("propaga un status: error de generarSintesis igual con status HTTP 200", async () => {
    const leerBody = vi.fn().mockResolvedValue(material);
    const generarSintesis = vi.fn().mockResolvedValue({ status: "error", mensaje: "No se pudo generar la síntesis" });
    const { resultado, status } = await manejarPedidoDeSintesis(leerBody, { generarSintesis });

    expect(status).toBe(200);
    expect(resultado).toEqual({ status: "error", mensaje: "No se pudo generar la síntesis" });
  });
});
