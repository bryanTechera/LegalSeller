import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BrandMark } from "@/components/brand/BrandMark";

import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

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
          Jurco
        </span>
        <h1 className={styles.titulo}>Board</h1>
        <p className={styles.subtitulo}>Te enviamos un enlace de acceso por correo.</p>
        <LoginForm errorInicial={error ?? null} />
      </div>
    </main>
  );
}
