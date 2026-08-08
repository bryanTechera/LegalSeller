import { describe, expect, it } from "vitest";

import { SITIO_URL } from "@/lib/marca";

import sitemap from "./sitemap";

describe("sitemap.xml", () => {
  const entradas = sitemap();

  it("lista la única URL pública del sitio, en absoluto", () => {
    expect(entradas.map((e) => e.url)).toEqual([`${SITIO_URL}/`]);
  });

  it("no lista rutas internas: /board, /login y /revision no son contenido", () => {
    const urls = entradas.map((e) => e.url).join(" ");
    expect(urls).not.toContain("/board");
    expect(urls).not.toContain("/login");
    expect(urls).not.toContain("/revision");
  });

  it("declara lastModified — es la señal de 'esto cambió' que dispara el re-rastreo", () => {
    expect(entradas[0]?.lastModified).toBeInstanceOf(Date);
  });

  it("el lastModified no depende de la hora del build: dos llamadas dan lo mismo", () => {
    expect(sitemap()[0]?.lastModified).toEqual(entradas[0]?.lastModified);
  });
});
