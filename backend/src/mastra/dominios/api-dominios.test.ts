import { describe, expect, it } from "vitest";

import { buildDominiosPayload } from "./api-dominios.js";

describe("payload de /api/dominios", () => {
  it("expone solo lo habilitado", () => {
    expect(buildDominiosPayload()).toEqual({
      categorias: [{ id: "laboral", nombre: "Laboral", subcategoriasHabilitadas: ["despido"] }],
    });
  });
});
