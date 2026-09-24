import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { VISITA_ESCRIBIO } from "./scope";

export interface VisitasPorOrigen {
  origen: string;
  visitantes: number;
  escribieron: number;
}

/**
 * La parte de arriba del funnel. Un visitante es una sesión distinta que cargó
 * la home en el rango; escribió si esa misma sesión tiene una conversación
 * real con actividad después de la visita.
 */
export interface Visitas {
  visitantes: number;
  escribieron: number;
  porOrigen: VisitasPorOrigen[];
}

const filaSchema = z.object({
  // null en la fila del total (el grouping set vacío).
  origen: z.string().nullable(),
  visitantes: z.coerce.number(),
  escribieron: z.coerce.number(),
});

/**
 * Una sola pasada con GROUPING SETS: el total no es la suma de los orígenes,
 * porque una sesión que llegó una vez por Instagram y otra directo cuenta en
 * los dos orígenes pero una sola vez en el total.
 */
export async function calcularVisitas(desde: Date | null): Promise<Visitas> {
  const filas = filaSchema.array().parse(
    await prisma.$queryRaw`
      SELECT v.origen,
             COUNT(DISTINCT v."sessionId")::float8 AS visitantes,
             COUNT(DISTINCT v."sessionId") FILTER (WHERE ${VISITA_ESCRIBIO})::float8 AS escribieron
      FROM "Visita" v
      WHERE (${desde}::timestamptz IS NULL OR v."createdAt" >= ${desde}::timestamptz)
      GROUP BY GROUPING SETS ((v.origen), ())
      ORDER BY visitantes DESC`,
  );

  const total = filas.find((fila) => fila.origen === null);
  return {
    visitantes: total?.visitantes ?? 0,
    escribieron: total?.escribieron ?? 0,
    porOrigen: filas
      .filter((fila): fila is typeof fila & { origen: string } => fila.origen !== null)
      .map(({ origen, visitantes, escribieron }) => ({ origen, visitantes, escribieron })),
  };
}
