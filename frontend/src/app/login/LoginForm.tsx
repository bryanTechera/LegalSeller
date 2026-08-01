"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import styles from "./login.module.css";

export function LoginForm({ errorInicial }: { errorInicial: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(
    errorInicial ? "No pudimos iniciar sesión con ese email." : null,
  );

  async function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const limpio = email.trim();
    if (!limpio) {
      setError("Ingresá tu email.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const resultado = await signIn("resend", { email: limpio, redirect: false, callbackUrl: "/board" });
      if (resultado?.error) {
        setError("No pudimos iniciar sesión con ese email.");
        setEnviando(false);
        return;
      }
      router.push("/login/check-email");
    } catch {
      setError("No pudimos enviar el enlace. Intentá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={(evento) => void onSubmit(evento)}>
      <label className={styles.label} htmlFor="email">
        Tu email
      </label>
      <input
        id="email"
        className={styles.input}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        disabled={enviando}
      />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <button className={styles.boton} type="submit" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviarme el enlace"}
      </button>
    </form>
  );
}
