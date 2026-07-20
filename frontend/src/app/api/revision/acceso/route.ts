import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { getRevisionClave, setExpertoCookie } from "@/lib/revision/experto-cookie";
import { accesoRevisionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

function clavesCoinciden(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Acceso del equipo legal al modo revisión: clave compartida + nombre. */
export async function POST(request: Request) {
  try {
    const clave = getRevisionClave();
    if (!clave) {
      return NextResponse.json({ error: "El modo revisión no está habilitado" }, { status: 503 });
    }

    // Freno de fuerza bruta sobre la clave compartida (por IP).
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = checkRateLimit(`revision-acceso:${ip}`, { limit: 10 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Esperá un momento e intentá de nuevo." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const validation = await parseRequestBody(request, accesoRevisionSchema);
    if (!validation.success) return validation.response;

    if (!clavesCoinciden(validation.data.clave, clave)) {
      return NextResponse.json({ error: "La clave no es correcta" }, { status: 401 });
    }

    await setExpertoCookie(validation.data.nombre, clave);
    return NextResponse.json({ ok: true, nombre: validation.data.nombre });
  } catch (error) {
    logger.error("revision/acceso failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
