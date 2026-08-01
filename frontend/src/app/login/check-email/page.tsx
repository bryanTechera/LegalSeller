import { BrandMark } from "@/components/brand/BrandMark";

import styles from "../login.module.css";

export default function CheckEmailPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.tarjeta}>
        <span className={styles.wordmark}>
          <BrandMark size={22} />
          Jurco
        </span>
        <h1 className={styles.titulo}>Revisá tu correo</h1>
        <p className={styles.subtitulo}>
          Te mandamos un enlace de acceso. Es válido por 24 horas y se usa una sola vez.
        </p>
      </div>
    </main>
  );
}
