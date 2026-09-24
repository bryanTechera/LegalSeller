import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Crawlers de previsualización (Meta los manda por cada anuncio y cada link
 * compartido), buscadores y navegadores headless. Un user agent vacío tampoco
 * es un navegador real.
 */
const PATRON_BOT = /bot|crawl|spider|slurp|facebookexternalhit|meta-externalads|headless|lighthouse|preview/i;

/** Una recarga dentro de esta ventana no es un visitante nuevo. */
const VENTANA_DEDUPLICACION_MS = 30 * 60 * 1000;

export function esBot(userAgent: string): boolean {
  return userAgent.trim() === "" || PATRON_BOT.test(userAgent);
}

function hostDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * De dónde vino el visitante, de la señal más explícita a la más débil. El
 * navegador interno de Instagram y Facebook casi nunca manda referrer, así
 * que sin UTM en el link de la campaña su user agent es la única pista.
 */
export function origenDeVisita(params: {
  userAgent: string;
  utmSource?: string;
  referrer?: string;
  host?: string;
}): string {
  const utm = params.utmSource?.trim().toLowerCase();
  if (utm) return utm;
  if (/\bInstagram\b/.test(params.userAgent)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/.test(params.userAgent)) return "facebook";
  const referrer = hostDe(params.referrer);
  const propio = params.host?.replace(/^www\./, "").toLowerCase();
  if (referrer && referrer !== propio) return referrer;
  return "directo";
}

export type ResultadoVisita = "registrada" | "duplicada" | "bot";

export async function registrarVisita(params: {
  sessionId: string;
  userAgent: string;
  host?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
}): Promise<ResultadoVisita> {
  if (esBot(params.userAgent)) return "bot";

  const reciente = await prisma.visita.findFirst({
    where: { sessionId: params.sessionId, createdAt: { gte: new Date(Date.now() - VENTANA_DEDUPLICACION_MS) } },
    select: { id: true },
  });
  if (reciente) return "duplicada";

  await prisma.visita.create({
    data: {
      sessionId: params.sessionId,
      origen: origenDeVisita(params),
      utmSource: params.utmSource ?? null,
      utmMedium: params.utmMedium ?? null,
      utmCampaign: params.utmCampaign ?? null,
      referrerHost: hostDe(params.referrer),
    },
  });
  return "registrada";
}
