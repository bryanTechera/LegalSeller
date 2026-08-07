import type { Graph } from "schema-dts";

import { DESCRIPCION_SITIO, MARCA, SITIO_URL } from "./marca";

/*
 * `@id` estables y absolutos: son la identidad de estos nodos para cualquier
 * consumidor, así que se referencian entre sí en vez de repetir la entidad. Un
 * `@id` relativo no identifica nada fuera de este documento.
 */
export const ID_ORGANIZACION = `${SITIO_URL}/#organizacion`;
export const ID_SITIO = `${SITIO_URL}/#sitio`;

/**
 * Grafo de identidad del sitio: quién publica y qué es este sitio.
 *
 * El motivo concreto (2026-08-07): en el resultado de Google el texto azul de
 * un home no es el `<title>`, es el *nombre del sitio*, que se calcula aparte y
 * se actualiza más lento. `WebSite.name` es su señal más fuerte, y era la única
 * de las tres —las otras dos son `og:site_name` y el `<title>`— que todavía no
 * estábamos dando. Después del rebrand el SERP seguía mostrando el nombre viejo.
 *
 * Lo que NO declara, a propósito: `LocalBusiness` (no hay dirección física
 * verificable), `AggregateRating` (no hay ratings reales, e inventarlos es
 * penalizable), `sameAs` (no hay perfiles) y `logo` (Google lo quiere cuadrado
 * y ráster; el `icon.svg` no cumple y la imagen de OG es un banner, no un logo).
 * Un marcado que afirma de más es peor que uno que falta.
 *
 * `SearchAction` tampoco: describiría un buscador propio que no existe.
 */
export function grafoDelSitio(): Graph {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ID_ORGANIZACION,
        name: MARCA,
        url: SITIO_URL,
        description: DESCRIPCION_SITIO,
      },
      {
        "@type": "WebSite",
        "@id": ID_SITIO,
        name: MARCA,
        url: SITIO_URL,
        inLanguage: "es-UY",
        description: DESCRIPCION_SITIO,
        publisher: { "@id": ID_ORGANIZACION },
      },
    ],
  };
}

/**
 * Serializa para meter dentro de un `<script type="application/ld+json">`.
 *
 * El escape de `<` no es decorativo: sin él, un `</script>` que llegara a
 * cualquiera de estos strings cerraría la etiqueta antes de tiempo y lo que
 * siguiera se ejecutaría como HTML. Hoy el contenido son constantes nuestras,
 * pero la función es el lugar donde esa garantía tiene que vivir.
 */
export function serializarJsonLd(datos: unknown): string {
  return JSON.stringify(datos).replace(/</g, "\\u003c");
}
