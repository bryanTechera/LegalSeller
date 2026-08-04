import { describe, expect, it } from "vitest";

import {
  citaDeBusqueda,
  citaDeFragmento,
  resumirPorRespuesta,
  textoDeMarca,
  textoDelMapa,
  type BusquedaCorpus,
  type FragmentoRecuperado,
} from "./fuentes";

const fragmento: FragmentoRecuperado = {
  documentId: "d1",
  documentTitle: "Ley 10.489",
  section: "art. 4",
  content: "El empleador que despida sin causa deberá abonar una indemnización.",
  similarity: 0.7912,
};

function busqueda(sobreescribir: Partial<BusquedaCorpus> = {}): BusquedaCorpus {
  return {
    spanId: "t1",
    messageId: "m2",
    agente: "laboral",
    consulta: "indemnización por despido antigüedad",
    categoria: "laboral",
    subcategorias: ["despido"],
    estado: "ok",
    fragmentos: [fragmento],
    fecha: "2026-08-04T10:00:00.000Z",
    ...sobreescribir,
  };
}

describe("citaDeBusqueda", () => {
  it("cita la consulta que armó el agente", () => {
    expect(citaDeBusqueda(busqueda())).toBe("Búsqueda: «indemnización por despido antigüedad»");
  });
});

describe("citaDeFragmento", () => {
  it("lleva documento, sección y score", () => {
    expect(citaDeFragmento(fragmento)).toBe(
      "Ley 10.489 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("sin sección no deja el guión colgando", () => {
    expect(citaDeFragmento({ ...fragmento, section: null })).toBe(
      "Ley 10.489 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("recorta para no pasarse del máximo que acepta el schema de notas", () => {
    // crearNotaSchema limita citaTexto a 2000 caracteres: una cita más larga
    // haría fallar el POST con un 400 que el experto vería como "no pudimos
    // guardar la nota", sin pista de que el problema es el largo.
    const largo = citaDeFragmento({ ...fragmento, content: "x".repeat(4000) });
    expect(largo.length).toBeLessThanOrEqual(2000);
    expect(largo.endsWith("…»")).toBe(true);
  });
});

describe("resumirPorRespuesta", () => {
  it("acumula consultas y fragmentos por respuesta", () => {
    const resumen = resumirPorRespuesta([
      busqueda({ spanId: "t1" }),
      busqueda({ spanId: "t2", fragmentos: [fragmento, fragmento] }),
    ]);
    expect(resumen.get("m2")).toEqual({ consultas: 2, fragmentos: 3, vacias: 0 });
  });

  it("cuenta como vacía cualquier búsqueda que no haya vuelto ok", () => {
    const resumen = resumirPorRespuesta([
      busqueda({ spanId: "t1" }),
      busqueda({ spanId: "t2", estado: "empty", fragmentos: [] }),
      busqueda({ spanId: "t3", estado: "ilegible", fragmentos: [] }),
    ]);
    expect(resumen.get("m2")).toEqual({ consultas: 3, fragmentos: 1, vacias: 2 });
  });

  it("las búsquedas huérfanas no entran al resumen por respuesta", () => {
    const resumen = resumirPorRespuesta([busqueda({ messageId: null })]);
    expect(resumen.size).toBe(0);
  });
});

describe("textoDeMarca", () => {
  it("sin vacías informa consultas y fragmentos", () => {
    expect(textoDeMarca({ consultas: 2, fragmentos: 7, vacias: 0 })).toBe("2 consultas · 7 fragmentos");
  });

  it("singular en uno y otro lado", () => {
    expect(textoDeMarca({ consultas: 1, fragmentos: 1, vacias: 0 })).toBe("1 consulta · 1 fragmento");
  });

  it("todas vacías lo dice sin número redundante", () => {
    expect(textoDeMarca({ consultas: 1, fragmentos: 0, vacias: 1 })).toBe("1 consulta · sin resultados");
  });

  it("algunas vacías informa cuántas", () => {
    expect(textoDeMarca({ consultas: 3, fragmentos: 4, vacias: 1 })).toBe("3 consultas · 1 sin resultados");
  });
});

describe("textoDelMapa", () => {
  it("cuenta cuántas consultas quedaron sin fuentes", () => {
    const texto = textoDelMapa([
      busqueda({ spanId: "t1" }),
      busqueda({ spanId: "t2" }),
      busqueda({ spanId: "t3", estado: "empty", fragmentos: [] }),
    ]);
    expect(texto).toBe("1 de 3 consultas volvió sin fuentes");
  });

  it("concordancia verbal con múltiples búsquedas vacías", () => {
    const texto = textoDelMapa([
      busqueda({ spanId: "t1", estado: "empty", fragmentos: [] }),
      busqueda({ spanId: "t2", estado: "error", fragmentos: [] }),
      busqueda({ spanId: "t3" }),
    ]);
    expect(texto).toBe("2 de 3 consultas volvieron sin fuentes");
  });

  it("todas con fuentes lo dice en positivo", () => {
    expect(textoDelMapa([busqueda()])).toBe("1 consulta, con fuentes");
  });
});
