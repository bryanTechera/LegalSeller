import { describe, expect, it } from "vitest";

import { buildDominiosPayload } from "./api-dominios.js";

describe("payload de /api/dominios", () => {
  it("expone solo lo habilitado", () => {
    expect(buildDominiosPayload()).toEqual({
      categorias: [
        {
          id: "laboral",
          nombre: "Laboral",
          subcategoriasHabilitadas: ["despido", "rubros-laborales", "trabajador-rural", "call-center"],
        },
        {
          id: "familia",
          nombre: "Familia",
          subcategoriasHabilitadas: [
            "pension-tenencia-visitas",
            "divorcio-sociedad-conyugal",
            "sucesiones",
            "union-concubinaria",
            "violencia-de-genero",
          ],
        },
        {
          id: "transito",
          nombre: "Tránsito",
          subcategoriasHabilitadas: [],
        },
        {
          id: "relaciones-consumo",
          nombre: "Relaciones de consumo",
          subcategoriasHabilitadas: ["derechos-del-consumidor", "procedimiento-mef-judicial"],
        },
      ],
    });
  });
});
