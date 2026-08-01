import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { prisma } from "../src/lib/prisma";
import { formatearSesionMarkdown } from "../src/lib/revision/exportar-markdown";
import { listarNotasDeSesion } from "../src/lib/revision/notas";
import { construirTimeline } from "../src/lib/revision/timeline";

// El script corre vía pnpm desde frontend/ — cwd estable, sin depender de
// __dirname (que cambia según el modo CJS/ESM de tsx).
const DESTINO = path.resolve(process.cwd(), "../tmp/feedback-legal");

async function main(): Promise<void> {
  // Incluye sesiones de revisión Y chats reales anotados desde el board: las
  // fallas de producción son el material más valioso del loop nota -> fix -> eval.
  //
  // El criterio de inclusión difiere por origen a propósito. Sesiones de
  // revisión: solo ABIERTA (sin cambios de comportamiento — una nota EXPERTO
  // arranca ABIERTA, así que esto es exactamente lo que traía antes). Chats
  // reales: cualquier nota no RESUELTA. Una nota del board nace con origen
  // DEV, que por diseño arranca RESPONDIDA (pendiente del experto, spec §5.2
  // — no se "corrige" a ABIERTA); pero un chat real no tiene otra superficie
  // donde el experto pueda verla y responderla (a diferencia de una sesión de
  // revisión, servida en /revision), así que si este script exigiera ABIERTA
  // también para chats reales, esas notas nunca llegarían a nadie: el loop
  // nota -> fix -> eval quedaría cortado desde el primer pull.
  const sesiones = await prisma.conversation.findMany({
    where: {
      OR: [
        { esRevision: true, notas: { some: { estado: "ABIERTA" } } },
        { esRevision: false, notas: { some: { estado: { not: "RESUELTA" } } } },
      ],
    },
    select: { id: true, threadId: true, titulo: true, creadaPor: true, esRevision: true },
    orderBy: { updatedAt: "desc" },
  });

  if (sesiones.length === 0) {
    process.stdout.write("No hay conversaciones con notas abiertas.\n");
    return;
  }

  mkdirSync(DESTINO, { recursive: true });
  for (const sesion of sesiones) {
    const [timeline, notas] = await Promise.all([
      construirTimeline(sesion.threadId, { conSpans: true }),
      listarNotasDeSesion(sesion.id),
    ]);
    const archivo = path.join(DESTINO, `${sesion.id}.md`);
    const etiquetada = {
      id: sesion.id,
      threadId: sesion.threadId,
      titulo: sesion.esRevision ? sesion.titulo : `[chat real] ${sesion.titulo ?? sesion.id}`,
      creadaPor: sesion.creadaPor,
    };
    writeFileSync(archivo, formatearSesionMarkdown({ sesion: etiquetada, timeline, notas }), "utf8");
    const pendientes = notas.filter((nota) => nota.estado !== "RESUELTA").length;
    process.stdout.write(`${archivo} — ${String(pendientes)} nota(s) pendiente(s)\n`);
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`feedback:pull falló: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
