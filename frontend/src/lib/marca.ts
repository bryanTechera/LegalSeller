/**
 * Identidad pública del producto, en un solo lugar.
 *
 * El rebrand de 2026-08-06 (Jurco -> DudaYa) tocó 198 lugares del repo porque el
 * nombre estaba escrito a mano en cada pantalla. Toda mención user-facing de la
 * marca sale de acá, así el próximo cambio es una línea.
 *
 * `LegalSeller` es el nombre del proyecto interno y NO se muestra nunca.
 */
export const MARCA = "DudaYa";

/**
 * Origen canónico del sitio. Es la base de `metadataBase`, y de ahí salen el
 * canonical y las URLs absolutas de Open Graph: sin esto, Next emite las
 * imágenes de OG con rutas relativas y ningún cliente las resuelve.
 *
 * Se puede pisar por entorno para que un deploy de preview no se anuncie con el
 * dominio de producción y le robe el canonical.
 */
export const SITIO_URL = process.env.NEXT_PUBLIC_SITIO_URL ?? "https://dudaya.com";
