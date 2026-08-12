import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listarCasos } from "@/lib/board/casos";
import { filtrosCasosSchema, parseSearchParams } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function GET(request: Request) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = parseSearchParams(new URL(request.url).searchParams, filtrosCasosSchema);
    if (!validation.success) return validation.response;

    return NextResponse.json(await listarCasos(validation.data));
  } catch (error) {
    logger.error("board/casos GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
