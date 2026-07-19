import "./globals.css";

import type { Metadata } from "next";
import { Open_Sans, Poppins, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";

/*
 * Identidad tipográfica: serif editorial para el titular (big-law de
 * prestigio), Poppins en caps con tracking para wordmark/labels y Open
 * Sans para cuerpo. next/font las sirve self-hosted (`font-src 'self'`).
 */
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display", display: "swap" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Jurco",
    template: "%s · Jurco",
  },
  description: "Consultas sobre documentos legales asistidas por IA, con fuentes citadas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${openSans.variable} ${poppins.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
