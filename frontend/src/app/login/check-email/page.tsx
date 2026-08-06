import type { Metadata } from "next";

import { BrandMark } from "@/components/brand/BrandMark";
import { MARCA } from "@/lib/marca";

import styles from "../login.module.css";

/** Pantalla intermedia del login del board: no tiene por qué estar en un índice. */
export const metadata: Metadata = {
  title: "Revisá tu correo",
  robots: { index: false, follow: false },
};

export default function CheckEmailPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.tarjeta}>
        <span className={styles.wordmark}>
          <BrandMark size={22} />
          {MARCA}
        </span>
        <h1 className={styles.titulo}>Revisá tu correo</h1>
        <p className={styles.subtitulo}>
          Te mandamos un enlace de acceso. Es válido por 24 horas y se usa una sola vez.
        </p>
      </div>
    </main>
  );
}
