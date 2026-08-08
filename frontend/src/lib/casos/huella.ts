import "server-only";

import { createHash } from "node:crypto";

export interface EntradaHuella {
  promptVersion: string;
  modelo: string;
  mensajes: { cantidad: number; ultimoId: string | null; ultimaFecha: string | null };
  caso: {
    categoria: string | null;
    subcategorias: string[];
    resumen: unknown;
    contactoNombre: string | null;
    contactoTelefono: string | null;
    contactoEmail: string | null;
    estado: string;
  };
}

/**
 * Huella del material que se resumió. Igual = la síntesis guardada sigue
 * vigente y no hace falta llamar al modelo.
 *
 * Todo lo que entra es CONTENIDO. Deliberadamente NO entra `Caso.updatedAt`:
 * escribir la síntesis toca la fila del caso en algunas de las rutas que la
 * rodean, y una huella que depende de un timestamp que la propia escritura
 * mueve regenera en cada apertura para siempre.
 *
 * Tampoco entran las notas del equipo legal: viven en su propia sección de la
 * vista y no son material del resumen (ver el spec §5.1).
 */
export function calcularHuella(entrada: EntradaHuella): string {
  const estable = {
    promptVersion: entrada.promptVersion,
    modelo: entrada.modelo,
    mensajes: entrada.mensajes,
    caso: {
      ...entrada.caso,
      // El orden viene de un Set y del orden en que las mandó el agente: sin
      // ordenar, la misma información produce huellas distintas.
      subcategorias: [...entrada.caso.subcategorias].sort(),
      resumen: entrada.caso.resumen === null ? null : ordenarClaves(entrada.caso.resumen),
    },
  };
  return createHash("sha256").update(JSON.stringify(estable)).digest("hex");
}

/** JSON.stringify preserva el orden de inserción; sobre un Json de Postgres eso no es estable. */
function ordenarClaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarClaves);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([clave, anidado]) => [clave, ordenarClaves(anidado)]),
    );
  }
  return valor;
}
