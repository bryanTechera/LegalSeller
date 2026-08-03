import { describe, expect, it } from "vitest";

import { buildDominiosPayload } from "./api-dominios.js";

describe("payload de /api/dominios", () => {
  it("expone solo lo habilitado", () => {
    expect(buildDominiosPayload()).toEqual({
      categorias: [
        {
          id: "laboral",
          nombre: "Laboral",
          subcategoriasHabilitadas: [
            "despido",
            "rubros-laborales",
            "trabajador-rural",
            "call-center",
            "licencias-especiales",
          ],
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
          id: "arrendamiento-desalojo",
          nombre: "Arrendamiento y desalojo",
          subcategoriasHabilitadas: [
            "contrato-de-alquiler",
            "desalojo-ley-8153",
            "desalojo-ley-14219",
            "desalojo-ley-19889",
            "cobro-alquileres",
            "arrendamiento-rural",
          ],
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
