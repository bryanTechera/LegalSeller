import { describe, expect, it } from "vitest";

import { grafoDelSitio, ID_ORGANIZACION, ID_SITIO, serializarJsonLd } from "./datos-estructurados";
import { MARCA, SITIO_URL } from "./marca";

describe("grafo JSON-LD del sitio", () => {
  const grafo = grafoDelSitio();
  const nodos = grafo["@graph"];

  it("declara exactamente un nodo Organization y uno WebSite", () => {
    const tipos = nodos.map((n) => (n as { "@type": string })["@type"]).sort();
    expect(tipos).toEqual(["Organization", "WebSite"]);
  });

  it("el WebSite lleva el nombre de la marca — es la señal más fuerte del site name en el SERP", () => {
    const sitio = nodos.find((n) => (n as { "@type": string })["@type"] === "WebSite");
    expect(sitio).toMatchObject({ "@id": ID_SITIO, name: MARCA, url: SITIO_URL, inLanguage: "es-UY" });
  });

  it("el WebSite referencia a la Organization por @id, sin duplicarla", () => {
    const sitio = nodos.find((n) => (n as { "@type": string })["@type"] === "WebSite");
    expect(sitio).toMatchObject({ publisher: { "@id": ID_ORGANIZACION } });
  });

  it("la Organization usa el mismo nombre y un @id estable", () => {
    const org = nodos.find((n) => (n as { "@type": string })["@type"] === "Organization");
    expect(org).toMatchObject({ "@id": ID_ORGANIZACION, name: MARCA, url: SITIO_URL });
  });

  it("no afirma nada que no podamos sostener: sin rating, sin dirección, sin perfiles", () => {
    const plano = JSON.stringify(grafo);
    expect(plano).not.toContain("aggregateRating");
    expect(plano).not.toContain("AggregateRating");
    expect(plano).not.toContain("address");
    expect(plano).not.toContain("LocalBusiness");
    expect(plano).not.toContain("sameAs");
  });

  it("todas las URLs son absolutas — un @id relativo no identifica nada entre sitios", () => {
    for (const url of JSON.stringify(grafo).match(/"(?:@id|url)":"([^"]+)"/g) ?? []) {
      expect(url).toContain(SITIO_URL);
    }
  });
});

describe("serializarJsonLd", () => {
  it("escapa '<' para que el contenido no pueda cerrar el <script> que lo envuelve", () => {
    const salida = serializarJsonLd({ "@context": "https://schema.org", name: "</script><img>" });
    expect(salida).not.toContain("</script>");
    expect(salida).toContain("\\u003c");
  });
});
