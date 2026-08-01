import "server-only";

import { auth } from "@/auth";
import { getExperto } from "@/lib/revision/experto-cookie";

export interface IdentidadBoard {
  nombre: string;
  tipo: "humano" | "runner";
}

/**
 * Resuelve quién está operando el board. Dos credenciales válidas:
 * la sesión Auth.js de una persona, y la cookie firmada con REVISION_CLAVE
 * que usa el runner de escenarios (`pnpm escenario`), que no puede completar
 * un magic link. La sesión humana tiene prioridad para que la autoría
 * registrada en las notas sea la de la persona real.
 */
export async function getIdentidadBoard(): Promise<IdentidadBoard | null> {
  const sesion = await auth();
  const usuario = sesion?.user;
  if (usuario) {
    const nombre = usuario.name?.trim() || usuario.email?.trim();
    if (nombre) return { nombre, tipo: "humano" };
  }

  const runner = await getExperto();
  if (runner) return { nombre: runner.nombre, tipo: "runner" };

  return null;
}
