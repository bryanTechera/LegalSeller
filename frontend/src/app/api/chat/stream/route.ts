import { NextResponse } from "next/server";

import { streamAgentMessage } from "@/lib/agent-service";
import { prisma } from "@/lib/prisma";
import { parseRequestBody, sendMessageSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/**
 * SSE proxy to the consultas agent. The browser never talks to the Mastra
 * backend directly.
 *
 * TODO(auth): replace the placeholder with `await auth()` once Auth.js is
 * wired (see docs/guia-codificacion-frontend.md §10). Until then this route
 * must not be exposed publicly.
 */
export async function POST(request: Request) {
  try {
    // Placeholder session until Auth.js lands. Kept explicit so the ownership
    // pattern below is already the real one.
    const session = { user: { id: process.env.DEV_USER_ID ?? "", name: "Dev" } };
    if (!session.user.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const validation = await parseRequestBody(request, sendMessageSchema);
    if (!validation.success) return validation.response;

    // Ownership always in the query.
    const consulta = await prisma.consulta.findFirst({
      where: { id: validation.data.consultaId, userId: session.user.id },
      select: { id: true, threadId: true },
    });
    if (!consulta) {
      return NextResponse.json({ error: "Consulta no encontrada" }, { status: 404 });
    }

    const upstream = await streamAgentMessage({
      agentId: "consultas",
      threadId: consulta.threadId,
      userId: session.user.id,
      userName: session.user.name,
      message: validation.data.message,
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      logger.error("Agent stream failed", { status: upstream.status });
      return NextResponse.json({ error: "El asistente no está disponible en este momento" }, { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("chat/stream failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
