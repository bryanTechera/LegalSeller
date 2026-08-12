"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand/BrandMark";
import { Wordmark } from "@/components/brand/Wordmark";

import styles from "./board.module.css";

const SECCIONES = [
  { href: "/board", etiqueta: "Métricas" },
  { href: "/board/casos", etiqueta: "Casos" },
  { href: "/board/chats", etiqueta: "Chats" },
  { href: "/board/revision", etiqueta: "Revisión" },
] as const;

export function Sidebar({ usuario }: { usuario: string }) {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Secciones del board">
      <span className={styles.wordmark}>
        <BrandMark size={22} />
        <Wordmark />
      </span>
      <ul className={styles.nav}>
        {SECCIONES.map((seccion) => {
          const activa =
            seccion.href === "/board" ? pathname === "/board" : pathname.startsWith(seccion.href);
          return (
            <li key={seccion.href}>
              <Link
                href={seccion.href}
                className={activa ? `${styles.link} ${styles.linkActivo}` : styles.link}
                aria-current={activa ? "page" : undefined}
              >
                {seccion.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
      <span className={styles.usuario}>{usuario}</span>
    </nav>
  );
}
