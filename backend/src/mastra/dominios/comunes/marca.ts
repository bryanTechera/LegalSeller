/**
 * Nombre comercial del producto, en un solo lugar.
 *
 * El rebrand de 2026-08-06 (Jurco -> DudaYa) tocó 198 lugares del repo porque el
 * nombre estaba escrito a mano en cada prompt. Toda mención de la marca dentro de
 * una rule o skill interpola esta constante, así el próximo cambio es una línea.
 *
 * Ojo: NO es el nombre del proyecto interno (LegalSeller), que el agente nunca
 * menciona — ver el test "no nombra el proyecto interno en el prompt".
 */
export const MARCA = "DudaYa";
