import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { obtenerCaso } from "@/lib/casos/caso-detalle";
import { logger } from "@/utils/logger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const caso = await obtenerCaso(id);
    if (!caso) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json(caso);
  } catch (error) {
    logger.error("board/casos/[id] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
