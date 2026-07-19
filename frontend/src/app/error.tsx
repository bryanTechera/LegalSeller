"use client";

import { useEffect } from "react";

import { logger } from "@/utils/logger";

import styles from "./error.module.css";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error("Unhandled page error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Algo salió mal</h1>
      <p className={styles.message}>Ocurrió un error inesperado. Podés intentar de nuevo.</p>
      <button type="button" className={styles.button} onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
