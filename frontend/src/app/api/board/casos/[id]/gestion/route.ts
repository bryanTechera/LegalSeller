import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { actualizarGestion } from "@/lib/casos/gestion";
import { actualizarGestionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    const autor = sesion?.user?.name?.trim() || sesion?.user?.email?.trim();
    // Mismo criterio que la ruta hermana de notas: el autor es identidad de
    // sesión. No se usa getIdentidadBoard() a propósito — acepta además la
    // cookie del runner de escenarios, y el runner no gestiona leads.
    if (!autor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = await parseRequestBody(request, actualizarGestionSchema);
    if (!validation.success) return validation.response;

    const { id } = await params;
    const gestion = await actualizarGestion({
      casoId: id,
      gestion: validation.data.gestion,
      nota: validation.data.nota,
      por: autor,
    });
    if (!gestion) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json({ gestion });
  } catch (error) {
    logger.error("board/casos/[id]/gestion PATCH failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
