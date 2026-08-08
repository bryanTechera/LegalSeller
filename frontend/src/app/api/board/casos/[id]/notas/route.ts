import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { crearNotaCaso } from "@/lib/casos/notas-caso";
import { crearNotaCasoSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    const autor = sesion?.user?.name?.trim() || sesion?.user?.email?.trim();
    if (!autor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = await parseRequestBody(request, crearNotaCasoSchema);
    if (!validation.success) return validation.response;

    const { id } = await params;
    // El autor es identidad de la sesión: un `autor` en el body se ignora.
    const nota = await crearNotaCaso({ casoId: id, autor, texto: validation.data.texto });
    if (!nota) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json({ nota }, { status: 201 });
  } catch (error) {
    logger.error("board/casos/[id]/notas POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
