import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { conversacionesReales } from "./scope";

export interface Funnel {
  iniciadas: number;
  clasificadas: number;
  conCaso: number;
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

/** Estados verificados en lib/clasificacion.ts. */
function casoReal(desde: Date | null): Prisma.CasoWhereInput {
  return {
    conversation: { esRevision: false },
    ...(desde ? { createdAt: { gte: desde } } : {}),
  };
}

export async function calcularFunnel(desde: Date | null): Promise<Funnel> {
  const [iniciadas, clasificadas, conCaso, captadas, fueraDeCobertura] = await Promise.all([
    prisma.conversation.count({ where: conversacionesReales(desde) }),
    prisma.conversation.count({
      where: { ...conversacionesReales(desde), categoria: { not: null } },
    }),
    prisma.conversation.count({ where: { ...conversacionesReales(desde), caso: { isNot: null } } }),
    prisma.caso.count({ where: { ...casoReal(desde), estado: "CAPTADO" } }),
    prisma.caso.count({ where: { ...casoReal(desde), estado: "FUERA_DE_COBERTURA" } }),
  ]);

  return { iniciadas, clasificadas, conCaso, captadas, fueraDeCobertura };
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
      JOIN "Conversation" conv ON conv.id = caso."conversationId"
      CROSS JOIN LATERAL unnest(caso.subcategorias) AS sub
      WHERE conv."esRevision" = false
        AND (${desde}::timestamptz IS NULL OR caso."createdAt" >= ${desde}::timestamptz)
      GROUP BY sub
      ORDER BY casos DESC`,
    prisma.caso.findMany({
      where: { ...casoReal(desde), estado: "FUERA_DE_COBERTURA" },
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
