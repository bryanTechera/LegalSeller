import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BrandMark } from "@/components/brand/BrandMark";
import { Wordmark } from "@/components/brand/Wordmark";

import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

/**
 * Puerta del back-office: no aporta nada a una búsqueda y no queremos el acceso
 * al board en un SERP de marca. El proxy no la cubre (es justamente la pantalla
 * a la que redirige), así que el `noindex` va acá.
 */
export const metadata: Metadata = {
  title: "Acceso al board",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sesion = await auth();
  if (sesion) redirect("/board");
  const { error } = await searchParams;

  return (
    <main className={styles.shell}>
      <div className={styles.tarjeta}>
        <span className={styles.wordmark}>
          <BrandMark size={22} />
          <Wordmark />
        </span>
        <h1 className={styles.titulo}>Board</h1>
        <p className={styles.subtitulo}>Te enviamos un enlace de acceso por correo.</p>
        <LoginForm errorInicial={error ?? null} />
      </div>
    </main>
  );
}
