import { BrandMark } from "@/components/brand/BrandMark";
import { ChatPanel } from "@/components/chat/ChatPanel";

import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.wordmark}>
          <BrandMark size={22} />
          Jurco
        </h1>
      </header>
      <main className={styles.main}>
        <ChatPanel />
      </main>
      <footer className={styles.footer}>
        <p>Jurco puede cometer errores y no sustituye el asesoramiento de un abogado.</p>
        <p>Tus conversaciones no se usan para entrenar modelos de IA.</p>
      </footer>
    </div>
  );
}
