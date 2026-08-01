import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { calcularMetricas } from "@/lib/board/metricas";
import { rangoSchema } from "@/lib/board/rango";
import { logger } from "@/utils/logger";

const RANGO_POR_DEFECTO = "30d";

export async function GET(request: Request) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const crudo = new URL(request.url).searchParams.get("rango") ?? RANGO_POR_DEFECTO;
    const rango = rangoSchema.safeParse(crudo);
    if (!rango.success) {
      return NextResponse.json({ error: "El rango solicitado no es válido" }, { status: 400 });
    }

    return NextResponse.json(await calcularMetricas(rango.data));
  } catch (error) {
    logger.error("board/metricas GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
