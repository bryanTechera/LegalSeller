import { z } from "zod";

export const rangoSchema = z.enum(["7d", "30d", "90d", "todo"]);
export type Rango = z.infer<typeof rangoSchema>;

const DIAS_POR_RANGO: Record<Exclude<Rango, "todo">, number> = { "7d": 7, "30d": 30, "90d": 90 };
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** `null` = sin cota inferior (rango "todo"). `ahora` es inyectable para tests. */
export function fechaDesde(rango: Rango, ahora: Date = new Date()): Date | null {
  if (rango === "todo") return null;
  return new Date(ahora.getTime() - DIAS_POR_RANGO[rango] * MS_POR_DIA);
}
