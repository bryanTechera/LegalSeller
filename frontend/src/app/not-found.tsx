import Link from "next/link";

import styles from "./error.module.css";

export default function NotFound() {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Página no encontrada</h1>
      <p className={styles.message}>La página que buscás no existe o fue movida.</p>
      <Link href="/">Volver al inicio</Link>
    </main>
  );
}
