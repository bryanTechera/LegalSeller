import { describe, expect, it } from "vitest";

import { evaluarExpectativas } from "./expectativas";
import type { CasoCorrida, TurnoCorrida } from "./schema";

function turno(toolCalls: TurnoCorrida["toolCalls"]): TurnoCorrida {
  return {
    n: 1,
    origen: "guion",
    usuario: "hola",
    respuesta: "…",
    toolCalls,
    latenciaPrimerByteMs: 100,
    latenciaTotalMs: 500,
  };
}

const casoCaptado: CasoCorrida = {
  estado: "CAPTADO",
  categoria: "familia",
  subcategorias: ["divorcio-sociedad-conyugal"],
  resumen: null,
  contactoNombre: "Mariana Techera",
  contactoTelefono: null,
  contactoEmail: null,
  eventos: [],
};

describe("evaluarExpectativas", () => {
  it("sin expectativas declaradas devuelve vacío", () => {
    expect(evaluarExpectativas(undefined, [turno([])], null)).toEqual([]);
  });

  it("clasificacion cumplida cuando asignar-clasificacion coincide", () => {
    const turnos = [
      turno([
        {
          toolName: "asignar-clasificacion",
          args: { categoria: "familia", subcategoria: "divorcio-sociedad-conyugal" },
        },
      ]),
    ];
    const [resultado] = evaluarExpectativas(
      { clasificacion: { categoria: "familia", subcategoria: "divorcio-sociedad-conyugal" } },
      turnos,
      null,
    );
    expect(resultado?.cumplida).toBe(true);
  });

  it("clasificacion incumplida sin tool-call ni evento del caso", () => {
    const [resultado] = evaluarExpectativas({ clasificacion: { categoria: "familia" } }, [turno([])], null);
    expect(resultado?.cumplida).toBe(false);
    expect(resultado?.obtenido).toBeNull();
  });

  it("clasificacion cumplida vía el evento CLASIFICACION del caso (el SSE del BFF no expone asignar-clasificacion)", () => {
    const caso: CasoCorrida = {
      ...casoCaptado,
      eventos: [
        {
          tipo: "CLASIFICACION",
          payload: { categoria: "familia", subcategoria: "divorcio-sociedad-conyugal", casoSensible: false },
          createdAt: "2026-07-22T19:22:59.931Z",
        },
      ],
    };
    const [resultado] = evaluarExpectativas(
      { clasificacion: { categoria: "familia", subcategoria: "divorcio-sociedad-conyugal" } },
      [turno([])],
      caso,
    );
    expect(resultado?.cumplida).toBe(true);
  });

  it("llamoBuscarDocumentos busca en todos los turnos", () => {
    const turnos = [turno([]), turno([{ toolName: "buscar-documentos", args: { consulta: "divorcio" } }])];
    const [resultado] = evaluarExpectativas({ llamoBuscarDocumentos: true }, turnos, null);
    expect(resultado?.cumplida).toBe(true);
  });

  it("casoCaptado y contactoRegistrado leen el snapshot del caso", () => {
    const resultados = evaluarExpectativas({ casoCaptado: true, contactoRegistrado: true }, [turno([])], casoCaptado);
    expect(resultados.map((resultado) => resultado.cumplida)).toEqual([true, true]);
  });

  it("contactoRegistrado incumplida sin caso", () => {
    const [resultado] = evaluarExpectativas({ contactoRegistrado: true }, [turno([])], null);
    expect(resultado?.cumplida).toBe(false);
  });

  it("pedidoContactoUnaVez cumplida con un único pedido en toda la corrida", () => {
    const turnos = [
      { ...turno([]), respuesta: "…dejame tu nombre y un teléfono así un abogado de la red revisa tu caso." },
      { ...turno([]), respuesta: "El plazo es de un año desde el cese. Contame la fecha y lo dimensionamos." },
    ];
    const [resultado] = evaluarExpectativas({ pedidoContactoUnaVez: true }, turnos, null);
    expect(resultado?.cumplida).toBe(true);
    expect(resultado?.obtenido).toBe(1);
  });

  it("pedidoContactoUnaVez incumplida cuando el pedido se repite tras ser ignorado", () => {
    const turnos = [
      { ...turno([]), respuesta: "…dejame tu nombre y un teléfono así un abogado de la red revisa tu caso." },
      { ...turno([]), respuesta: "Eso depende del laudo. ¿Me dejás un teléfono de contacto y tu nombre así te llaman?" },
    ];
    const [resultado] = evaluarExpectativas({ pedidoContactoUnaVez: true }, turnos, null);
    expect(resultado?.cumplida).toBe(false);
    expect(resultado?.obtenido).toBe(2);
  });
});
