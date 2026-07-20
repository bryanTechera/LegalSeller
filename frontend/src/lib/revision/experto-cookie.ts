import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

export const EXPERTO_COOKIE = "ls_experto";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** Clave compartida del modo revisión. null = feature apagada. */
export function getRevisionClave(): string | null {
  return process.env.REVISION_CLAVE ?? null;
}

function firmar(payload: string, clave: string): string {
  return createHmac("sha256", clave).update(payload).digest("base64url");
}

/**
 * Valor de cookie: base64url(JSON { nombre, iat }) + "." + HMAC-SHA256.
 * El secreto de firma ES la clave compartida — rotar REVISION_CLAVE revoca
 * todas las cookies emitidas (spec §9).
 */
export function crearValorCookieExperto(nombre: string, clave: string): string {
  const payload = Buffer.from(JSON.stringify({ nombre, iat: Date.now() })).toString("base64url");
  return `${payload}.${firmar(payload, clave)}`;
}

export function verificarValorCookieExperto(
  valor: string | undefined,
  clave: string | null,
): { nombre: string } | null {
  if (!valor || !clave) return null;
  const partes = valor.split(".");
  if (partes.length !== 2) return null;
  const [payload, firma] = partes;
  if (!payload || !firma) return null;
  const esperada = Buffer.from(firmar(payload, clave));
  const recibida = Buffer.from(firma);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "nombre" in parsed &&
      typeof (parsed as { nombre: unknown }).nombre === "string"
    ) {
      return { nombre: (parsed as { nombre: string }).nombre };
    }
  } catch {
    // payload no-JSON → cae al null final
  }
  return null;
}

export async function setExpertoCookie(nombre: string, clave: string): Promise<void> {
  const store = await cookies();
  store.set(EXPERTO_COOKIE, crearValorCookieExperto(nombre, clave), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

/** Gate server-side de /api/revision/*: experto autenticado o null. */
export async function getExperto(): Promise<{ nombre: string } | null> {
  const store = await cookies();
  return verificarValorCookieExperto(store.get(EXPERTO_COOKIE)?.value, getRevisionClave());
}
