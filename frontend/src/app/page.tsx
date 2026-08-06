import type { Metadata } from "next";

import { BrandMark } from "@/components/brand/BrandMark";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MARCA } from "@/lib/marca";

import styles from "./page.module.css";

/**
 * El canonical se declara por página, no en el layout: `alternates` se hereda,
 * y en el layout haría que toda ruta hija se declare canónica de "/".
 *
 * Acá NO va `openGraph`: declararlo reemplazaría el bloque entero del layout
 * (Next mergea metadata campo a campo, no en profundidad) y se perderían
 * siteName, type y locale.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>
          <BrandMark size={22} />
          {MARCA}
        </h1>
      </header>
      <main className={styles.main}>
        <ChatPanel />
      </main>
      <footer className={styles.footer}>
        <p>{MARCA} puede cometer errores y no sustituye el asesoramiento de un abogado.</p>
        <p>Tus conversaciones no se usan para entrenar modelos de IA.</p>
      </footer>
    </div>
  );
}
