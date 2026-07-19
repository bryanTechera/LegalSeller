import "./globals.css";

import type { Metadata } from "next";
import { Open_Sans, Poppins } from "next/font/google";
import type { ReactNode } from "react";

/*
 * Identidad tipográfica según la referencia visual del producto (estudio
 * jurídico: Poppins para títulos/CTAs, Open Sans para cuerpo).
 * next/font las sirve self-hosted, compatible con `font-src 'self'`.
 */
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Jurco",
    template: "%s · Jurco",
  },
  description: "Consultas sobre documentos legales asistidas por IA, con fuentes citadas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${openSans.variable} ${poppins.variable}`}>
      <body>{children}</body>
    </html>
  );
}
