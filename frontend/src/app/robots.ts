import type { MetadataRoute } from "next";

import { SITIO_URL } from "@/lib/marca";

/**
 * Hasta ahora no había robots.txt (daba 404), que para un crawler significa
 * "todo permitido". Este archivo **preserva** esa política y no la endurece: su
 * razón de ser es declarar el sitemap, que es lo que le da a Google una señal
 * de "esto cambió" en cada deploy.
 *
 * Sin reglas por agente a propósito: la política sobre crawlers de IA es una
 * decisión de estrategia de canal que el equipo todavía no tomó (auditoría SEO
 * §4.11). Bloquearlos "porque son la competencia" cierra el canal donde este
 * producto podría aparecer citado, y como el corpus no se publica, permitirlos
 * no expone nada. Cuando se decida, se expresa acá.
 *
 * `/login` NO se bloquea, y es deliberado: lleva `noindex`, y un `Disallow`
 * impediría que Google lo rastree, con lo cual nunca vería ese `noindex` — la
 * URL puede terminar igual en el índice, solo que sin snippet. Bloquear el
 * rastreo y pedir la desindexación son incompatibles: se elige uno.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // No son páginas: rastrearlas solo gasta presupuesto. /board además
        // redirige al login, así que no hay nada indexable detrás.
        disallow: ["/api/", "/board/"],
      },
    ],
    sitemap: `${SITIO_URL}/sitemap.xml`,
  };
}
