import "./globals.css";

import type { Metadata } from "next";
import { Open_Sans, Poppins, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";

import { MARCA, SITIO_URL } from "@/lib/marca";

/*
 * Identidad tipográfica: serif editorial para el titular (big-law de
 * prestigio), Poppins para wordmark y labels —estos en caps con tracking, el
 * wordmark en caja mixta y a dos tonos— y Open Sans para cuerpo. next/font las
 * sirve self-hosted (`font-src 'self'`).
 *
 * Presupuesto de preload (auditoría SEO 2026-08-06): las tres familias se
 * preloadeaban a prioridad alta, 117.520 B compitiendo con el CSS y el JS en la
 * ruta crítica. Ahora preloadean solo las dos que pintan primero:
 *  - Open Sans: cuerpo, subtítulo, tarjetas y footer.
 *  - Source Serif 4: `.heroTitle`, que es el elemento LCP medido — sacarle el
 *    preload adelantaría el paint con el fallback a costa de un swap visible en
 *    el titular, así que se queda, pero clavada al único peso que usa el CSS
 *    (600) en vez del archivo variable 200-900.
 *  - Poppins: wordmark y labels, nada de eso es LCP -> `preload: false`, y sin
 *    el peso 500, que no aparece en ninguna hoja de estilos.
 */
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-display",
  display: "swap",
  preload: false,
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: "600",
  variable: "--font-serif",
  display: "swap",
});

const DESCRIPCION =
  "Contá tu situación y recibí orientación legal clara sobre despido, familia, alquileres, tránsito y consumo en Uruguay. Si necesitás un abogado, te derivamos.";

/*
 * `metadataBase` es el prerrequisito de todo lo demás: sin él, Next emite las
 * URLs de Open Graph y el canonical en relativo y ningún cliente los resuelve.
 *
 * El canonical NO va acá: `alternates` se hereda a todas las rutas hijas, así
 * que declararlo en el layout haría que /login se declare canónica de "/".
 * Cada página pública declara el suyo (ver app/page.tsx).
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  title: {
    default: "Consultas legales en Uruguay, al instante | DudaYa",
    template: `%s · ${MARCA}`,
  },
  description: DESCRIPCION,
  applicationName: MARCA,
  /*
   * El objeto `openGraph` se REEMPLAZA entero cuando una página declara el
   * suyo — Next mergea metadata campo a campo del nivel superior, no en
   * profundidad. Declarar `openGraph: { url: "/" }` en app/page.tsx borraba de
   * un saque siteName, type y locale. Por eso el bloque vive completo acá y la
   * página solo aporta su canonical.
   */
  openGraph: {
    type: "website",
    siteName: MARCA,
    locale: "es_UY",
    url: "/",
    title: "Consultas legales en Uruguay, al instante",
    description: DESCRIPCION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Consultas legales en Uruguay, al instante",
    description: DESCRIPCION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-UY" className={`${openSans.variable} ${poppins.variable} ${sourceSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
