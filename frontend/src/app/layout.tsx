import "./globals.css";

import type { Metadata } from "next";
import { Archivo, Bitter } from "next/font/google";
import type { ReactNode } from "react";

/*
 * Identidad tipográfica rioplatense: Bitter (Huerta Tipográfica) para
 * display y Archivo (Omnibus-Type) para UI — ambas fundiciones argentinas.
 * next/font las sirve self-hosted, compatible con `font-src 'self'`.
 */
const archivo = Archivo({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const bitter = Bitter({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Jurco",
    template: "%s · Jurco",
  },
  description: "Consultas sobre documentos legales asistidas por IA, con fuentes citadas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${archivo.variable} ${bitter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
