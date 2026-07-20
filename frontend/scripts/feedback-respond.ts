import "dotenv/config";

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { prisma } from "../src/lib/prisma";
import { crearNota, resolverNota, responderNota } from "../src/lib/revision/notas";

const AUTOR_DEV = "equipo-dev";

const USO = `Uso:
  pnpm feedback:respond --nota <id> --texto "..." [--resolver]   responde una nota (y opcionalmente la cierra)
  pnpm feedback:respond --nota <id> --archivo <path> [--resolver] idem, texto desde archivo
  pnpm feedback:respond --nota <id> --resolver                    solo cierra la nota
  pnpm feedback:respond --sesion <conversationId> --texto "..."   crea una nota nueva del equipo dev (nace RESPONDIDA)
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      nota: { type: "string" },
      sesion: { type: "string" },
      texto: { type: "string" },
      archivo: { type: "string" },
      resolver: { type: "boolean", default: false },
    },
  });

  const texto = values.archivo ? readFileSync(values.archivo, "utf8").trim() : values.texto?.trim();

  if (values.sesion) {
    if (!texto) throw new Error(`--sesion requiere --texto o --archivo\n${USO}`);
    const nota = await crearNota({ conversationId: values.sesion, origen: "DEV", autor: AUTOR_DEV, texto });
    if (!nota) throw new Error(`La sesión ${values.sesion} no existe o no es una sesión de revisión.`);
    process.stdout.write(`Nota ${nota.id} creada (RESPONDIDA) en la sesión ${values.sesion}\n`);
    return;
  }

  if (!values.nota) throw new Error(USO);

  if (texto) {
    const result = await responderNota({ notaId: values.nota, origen: "DEV", autor: AUTOR_DEV, texto });
    if (!result.ok) throw new Error(`La nota ${values.nota} no existe o está RESUELTA.`);
    process.stdout.write(`Respuesta publicada en la nota ${values.nota}\n`);
  }

  if (values.resolver) {
    const result = await resolverNota(values.nota);
    if (!result.ok) throw new Error(`La nota ${values.nota} no existe.`);
    process.stdout.write(`Nota ${values.nota} marcada RESUELTA\n`);
  }

  if (!texto && !values.resolver) throw new Error(USO);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`feedback:respond falló: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
