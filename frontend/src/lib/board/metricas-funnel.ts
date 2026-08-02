import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { casosReales, conversacionesReales, JOIN_CASO_REAL } from "./scope";

export interface Funnel {
  iniciadas: number;
  clasificadas: number;
  captadas: number;
  fueraDeCobertura: number;
}

export interface DemandaCategoria {
  categoria: string;
  conversaciones: number;
}

export interface DemandaSubcategoria {
  subcategoria: string;
  casos: number;
}

export interface PedidoFueraDeCobertura {
  conversationId: string;
  fecha: string;
  resumen: string | null;
}

export interface Demanda {
  categorias: DemandaCategoria[];
  subcategorias: DemandaSubcategoria[];
  fueraDeCobertura: PedidoFueraDeCobertura[];
}

const LIMITE_FUERA_DE_COBERTURA = 50;

/**
 * El funnel no cuenta "con caso" (conversaciones con un `Caso` en cualquier
 * estado). Un caso sin contacto no es accionable por un abogado, y esa barra
 * además rompía la monotonía del gráfico: un `Caso` FUERA_DE_COBERTURA se crea
 * antes de que `asignarClasificacion` escriba `Conversation.categoria`, así que
 * contaba en "Con caso" sin contar en "Clasificadas" y el funnel se leía como
 * un dashboard roto. Los captados salen del funnel con nombre y apellido en
 * `listarCaptados`.
 */
export async function calcularFunnel(desde: Date | null): Promise<Funnel> {
  const [iniciadas, clasificadas, captadas, fueraDeCobertura] = await Promise.all([
    prisma.conversation.count({ where: conversacionesReales(desde) }),
    prisma.conversation.count({
      where: { ...conversacionesReales(desde), categoria: { not: null } },
    }),
    prisma.caso.count({ where: { ...casosReales(desde), estado: "CAPTADO" } }),
    prisma.caso.count({ where: { ...casosReales(desde), estado: "FUERA_DE_COBERTURA" } }),
  ]);

  return { iniciadas, clasificadas, captadas, fueraDeCobertura };
}

const filaSubcategoriaSchema = z.object({
  subcategoria: z.string(),
  casos: z.coerce.number(),
});

/** El brief fáctico que dejó `registrar-caso`; shapes desconocidos → null. */
function extraerResumen(resumen: unknown): string | null {
  if (typeof resumen === "string") return resumen;
  if (resumen && typeof resumen === "object" && "brief" in resumen) {
    const brief = (resumen as { brief: unknown }).brief;
    if (typeof brief === "string") return brief;
  }
  return null;
}

export async function calcularDemanda(desde: Date | null): Promise<Demanda> {
  const [porCategoria, porSubcategoria, pedidos] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["categoria"],
      where: conversacionesReales(desde),
      _count: { _all: true },
    }),
    prisma.$queryRaw`
      SELECT sub AS subcategoria, COUNT(*)::float8 AS casos
      FROM "Caso" caso
      ${JOIN_CASO_REAL}
      CROSS JOIN LATERAL unnest(caso.subcategorias) AS sub
      WHERE (${desde}::timestamptz IS NULL OR caso."createdAt" >= ${desde}::timestamptz)
      GROUP BY sub
      ORDER BY casos DESC`,
    prisma.caso.findMany({
      where: { ...casosReales(desde), estado: "FUERA_DE_COBERTURA" },
      select: { conversationId: true, createdAt: true, resumen: true },
      orderBy: { createdAt: "desc" },
      take: LIMITE_FUERA_DE_COBERTURA,
    }),
  ]);

  return {
    categorias: porCategoria
      .filter((fila): fila is typeof fila & { categoria: string } => fila.categoria !== null)
      .map((fila) => ({ categoria: fila.categoria, conversaciones: fila._count._all }))
      .sort((a, b) => b.conversaciones - a.conversaciones),
    subcategorias: filaSubcategoriaSchema.array().parse(porSubcategoria),
    fueraDeCobertura: pedidos.map((pedido) => ({
      conversationId: pedido.conversationId,
      fecha: pedido.createdAt.toISOString(),
      resumen: extraerResumen(pedido.resumen),
    })),
  };
}
