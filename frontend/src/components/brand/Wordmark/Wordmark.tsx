import { MARCA_ACENTO, MARCA_RAIZ } from "@/lib/marca";

import styles from "./Wordmark.module.css";

/**
 * El nombre de la marca en dos tonos: "Duda" en la tinta que herede del
 * contenedor y "Ya" en el acento. Sirve para que se lean las dos palabras del
 * compuesto — en un solo color y en versalitas se leía "DUDAYA".
 *
 * No trae tamaño ni familia propios: los hereda del contenedor que lo usa
 * (`.wordmark` de cada pantalla), que es quien decide la escala.
 */
export function Wordmark() {
  return (
    <span>
      {MARCA_RAIZ}
      <span className={styles.acento}>{MARCA_ACENTO}</span>
    </span>
  );
}
