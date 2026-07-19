import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>LegalSeller</h1>
      <p className={styles.subtitle}>
        Consultas sobre documentos legales asistidas por IA, con fuentes citadas.
      </p>
      <p className={styles.status}>MVP en construcción.</p>
    </main>
  );
}
