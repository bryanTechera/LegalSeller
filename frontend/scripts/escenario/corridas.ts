/** Lectura de escenarios y persistencia de corridas (JSON fuente + MD legible). */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderCorridaMarkdown } from "../../src/lib/escenarios/reporte-markdown";
import { escenarioSchema } from "../../src/lib/escenarios/schema";
import type { Corrida, Escenario } from "../../src/lib/escenarios/schema";

// El script corre vía pnpm desde frontend/ — cwd estable (mismo criterio que
// scripts/feedback-pull.ts).
const RAIZ = path.resolve(process.cwd(), "escenarios");

export function leerEscenario(slug: string): Escenario {
  const ruta = path.join(RAIZ, `${slug}.json`);
  if (!existsSync(ruta)) throw new Error(`No existe el escenario "${slug}" (${ruta})`);
  return escenarioSchema.parse(JSON.parse(readFileSync(ruta, "utf8")));
}

/** Escribe <base>.json y <base>.md; devuelve la base (sin extensión). */
export function guardarCorrida(corrida: Corrida, base?: string): string {
  const dir = path.join(RAIZ, "corridas", corrida.escenario);
  mkdirSync(dir, { recursive: true });
  const archivoBase = base ?? path.join(dir, corrida.inicio.replaceAll(":", "-"));
  writeFileSync(`${archivoBase}.json`, JSON.stringify(corrida, null, 2), "utf8");
  writeFileSync(`${archivoBase}.md`, renderCorridaMarkdown(corrida), "utf8");
  return archivoBase;
}

/** Busca la corrida local de una sesión (para `continuar`). */
export function localizarCorrida(sesionId: string): { corrida: Corrida; base: string } | null {
  const dirCorridas = path.join(RAIZ, "corridas");
  if (!existsSync(dirCorridas)) return null;
  for (const entrada of readdirSync(dirCorridas, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const dirSlug = path.join(dirCorridas, entrada.name);
    for (const archivo of readdirSync(dirSlug).filter((nombre) => nombre.endsWith(".json"))) {
      const ruta = path.join(dirSlug, archivo);
      const corrida = JSON.parse(readFileSync(ruta, "utf8")) as Corrida;
      if (corrida.sesionId === sesionId) return { corrida, base: ruta.slice(0, -".json".length) };
    }
  }
  return null;
}
