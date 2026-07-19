import { afterEach, describe, expect, it, vi } from "vitest";

import { esCategoriaHabilitada, getDominios, invalidateDominiosCache, subcategoriaUnica } from "./dominios";

const payload = {
  categorias: [{ id: "laboral", nombre: "Laboral", subcategoriasHabilitadas: ["despido"] }],
};

describe("lib/dominios", () => {
  afterEach(() => {
    invalidateDominiosCache();
    vi.unstubAllGlobals();
  });

  it("cachea el fetch al backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);
    await getDominios();
    await getDominios();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("responde habilitación y cortocircuito de subcategoría única", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    expect(await esCategoriaHabilitada("laboral")).toBe(true);
    expect(await esCategoriaHabilitada("familia")).toBe(false);
    expect(await subcategoriaUnica("laboral")).toBe("despido");
  });
});
