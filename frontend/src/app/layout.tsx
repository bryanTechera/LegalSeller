import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "LegalSeller",
    template: "%s · LegalSeller",
  },
  description: "Consultas sobre documentos legales asistidas por IA, con fuentes citadas.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
