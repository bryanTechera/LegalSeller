import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { getOrCreateSessionId } from "@/lib/session";
import { parseRequestBody, registrarVisitaSchema } from "@/lib/validations";
import { registrarVisita } from "@/lib/visitas";
import { logger } from "@/utils/logger";

/**
 * Beacon de visita de la home. Setea la cookie de sesión si no existe, la
 * misma que después usa el chat: así una visita y la conversación que abre
 * comparten `sessionId` y el board puede medir cuántos visitantes escribieron.
 *
 * Nunca falla hacia el navegador: es medición, y un error acá no puede
 * ensuciar la experiencia del consultante.
 */
export async function POST(request: Request) {
  const validation = await parseRequestBody(request, registrarVisitaSchema);
  if (!validation.success) return validation.response;

  try {
    // Cada visita es una escritura en la base: el tope por IP evita que
    // alguien que rota la cookie llene la tabla.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(`visita:${ip}`, { limit: 30 }).allowed) return new NextResponse(null, { status: 204 });

    const sessionId = await getOrCreateSessionId();
    await registrarVisita({
      sessionId,
      userAgent: request.headers.get("user-agent") ?? "",
      host: new URL(request.url).hostname,
      ...validation.data,
    });
  } catch (error) {
    logger.error("visita failed", { error: error instanceof Error ? error.message : String(error) });
  }
  return new NextResponse(null, { status: 204 });
}
