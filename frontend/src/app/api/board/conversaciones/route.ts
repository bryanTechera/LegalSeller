import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listarConversaciones } from "@/lib/board/conversaciones";
import { filtrosChatsSchema, parseSearchParams } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function GET(request: Request) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = parseSearchParams(new URL(request.url).searchParams, filtrosChatsSchema);
    if (!validation.success) return validation.response;

    return NextResponse.json(await listarConversaciones(validation.data));
  } catch (error) {
    logger.error("board/conversaciones GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
