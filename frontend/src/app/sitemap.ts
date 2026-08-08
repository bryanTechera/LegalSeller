import type { MetadataRoute } from "next";

import { SITIO_URL } from "@/lib/marca";

/**
 * Fecha del último cambio real del contenido del home, a mano y a propósito.
 *
 * Lo natural sería `new Date()`, pero esto corre en build: cada deploy —aunque
 * toque el board o un test— le declararía a Google que el home cambió. Un
 * `lastmod` que miente en cada deploy es un `lastmod` que Google aprende a
 * ignorar, y entonces deja de servir para lo único que lo queremos.
 *
 * Se bumpea cuando cambia lo que se ve en `/`: copy, título o descripción.
 */
const ULTIMO_CAMBIO_HOME = new Date("2026-08-06");

/**
 * Hoy el sitio tiene una sola URL pública; las demás rutas son el back-office.
 * Cuando existan las páginas de contenido, el árbol tiene que salir de un
 * módulo del checkout y NO de la base ni del backend: esto se ejecuta en la
 * etapa builder del Dockerfile, donde no hay `DATABASE_URL` ni Mastra
 * alcanzable, y el `docker build` fallaría con un error de fetch que no
 * menciona SEO por ningún lado.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITIO_URL}/`,
      lastModified: ULTIMO_CAMBIO_HOME,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
