import { ImageResponse } from "next/og";

import { MARCA } from "@/lib/marca";

/*
 * Tarjeta que ve quien recibe un link del sitio por WhatsApp — el canal por el
 * que se comparte una consulta legal en Uruguay. Sin esto el link viaja como
 * texto pelado (auditoría SEO 2026-08-06).
 *
 * Va por convención de archivo del App Router y NO por `public/`: el Dockerfile
 * no copia `public/` a la imagen de producción, así que un PNG estático ahí
 * andaría en `pnpm dev` y daría 404 en producción. Esto se compila dentro de
 * `.next` y viaja con la imagen.
 *
 * Sin `fonts` declaradas a propósito: ImageResponse usa la tipografía que trae
 * embebida y no sale a la red. Una fuente remota rompería el `docker build`, que
 * corre sin acceso garantizado a internet.
 */
export const alt = `${MARCA} — Consultas legales en Uruguay`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NAVY = "#132a3b";
const ACENTO = "#3185c9";
const SOBRE_NAVY_TENUE = "#b9c7d4";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: NAVY,
          padding: "80px 90px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* Balanza: misma geometría que BrandMark y que el favicon. */}
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none" stroke={ACENTO} strokeWidth="1.8" strokeLinecap="round">
            <line x1="16" y1="7" x2="16" y2="24" />
            <line x1="11" y1="25" x2="21" y2="25" />
            <line x1="8" y1="10" x2="24" y2="10" />
            <line x1="8" y1="10" x2="5" y2="15" />
            <line x1="8" y1="10" x2="11" y2="15" />
            <line x1="24" y1="10" x2="21" y2="15" />
            <line x1="24" y1="10" x2="27" y2="15" />
            <path d="M4 15 a4 4 0 0 0 8 0" />
            <path d="M20 15 a4 4 0 0 0 8 0" />
          </svg>
          <span style={{ fontSize: 52, color: "#ffffff", letterSpacing: "0.02em" }}>{MARCA}</span>
        </div>
        <div style={{ fontSize: 68, color: "#ffffff", lineHeight: 1.15, marginTop: 48 }}>
          Consultas legales en Uruguay, al instante
        </div>
        <div style={{ fontSize: 32, color: SOBRE_NAVY_TENUE, marginTop: 28 }}>
          Contá tu situación y recibí orientación clara. Si necesitás un abogado, te derivamos.
        </div>
      </div>
    ),
    size,
  );
}
