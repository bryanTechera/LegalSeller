import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { resolverNota } from "@/lib/revision/notas";
import { parseRequestBody, resolverNotaSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function PATCH(request: Request, { params }: { params: Promise<{ notaId: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { notaId } = await params;
    const validation = await parseRequestBody(request, resolverNotaSchema);
    if (!validation.success) return validation.response;

    const result = await resolverNota(notaId);
    if (!result.ok) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("revision/notas PATCH failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
