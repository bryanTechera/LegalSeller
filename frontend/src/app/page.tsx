import { ChatPanel } from "@/components/chat/ChatPanel";

import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>LegalSeller</h1>
        <p className={styles.subtitle}>Consultas sobre documentos legales, con fuentes citadas.</p>
      </header>
      <ChatPanel />
      <p className={styles.disclaimer}>
        Las respuestas son informativas y se basan en los documentos del corpus; no constituyen asesoramiento legal.
      </p>
    </main>
  );
}
