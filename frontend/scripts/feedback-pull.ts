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
  const sesiones = await prisma.conversation.findMany({
    where: { esRevision: true, notas: { some: { estado: "ABIERTA" } } },
    select: { id: true, threadId: true, titulo: true, creadaPor: true },
    orderBy: { updatedAt: "desc" },
  });

  if (sesiones.length === 0) {
    process.stdout.write("No hay sesiones de revisión con notas abiertas.\n");
    return;
  }

  mkdirSync(DESTINO, { recursive: true });
  for (const sesion of sesiones) {
    const [timeline, notas] = await Promise.all([
      construirTimeline(sesion.threadId, { conSpans: true }),
      listarNotasDeSesion(sesion.id),
    ]);
    const archivo = path.join(DESTINO, `${sesion.id}.md`);
    writeFileSync(archivo, formatearSesionMarkdown({ sesion, timeline, notas }), "utf8");
    const abiertas = notas.filter((nota) => nota.estado === "ABIERTA").length;
    process.stdout.write(`${archivo} — ${String(abiertas)} nota(s) abiertas\n`);
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`feedback:pull falló: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
