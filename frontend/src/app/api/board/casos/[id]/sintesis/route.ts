import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { asegurarSintesis } from "@/lib/casos/sintesis";
import { logger } from "@/utils/logger";

/** Regenerar a pedido: `forzar` ignora la huella y vuelve a llamar al modelo. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sintesis = await asegurarSintesis(id, { forzar: true });
    if (sintesis.estado === "sin-sintesis") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ sintesis });
  } catch (error) {
    logger.error("board/casos/[id]/sintesis POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
