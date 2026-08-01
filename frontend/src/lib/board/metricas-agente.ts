import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { estimarCostoUsd } from "./costos";
import { JOIN_REALES, WHERE_REALES } from "./scope";

export interface UsoModelo {
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number | null;
}

export interface UsoTool {
  tool: string;
  llamadas: number;
}

export interface Latencia {
  p50Ms: number;
  p95Ms: number;
}

export interface PuntoSerie {
  fecha: string;
  valor: number;
}

export interface FranjaHoraria {
  hora: number;
  conversaciones: number;
}

export interface Volumen {
  porDia: PuntoSerie[];
  porHora: FranjaHoraria[];
  mensajesPorConversacion: number;
  tasaAbandono: number;
}

const filaModeloSchema = z.object({
  modelo: z.string(),
  tokensEntrada: z.coerce.number(),
  tokensSalida: z.coerce.number(),
});

const filaToolSchema = z.object({ tool: z.string(), llamadas: z.coerce.number() });
const filaLatenciaSchema = z.object({ p50Ms: z.coerce.number(), p95Ms: z.coerce.number() });
const filaSerieSchema = z.object({ fecha: z.string(), valor: z.coerce.number() });
const filaHoraSchema = z.object({ hora: z.coerce.number(), conversaciones: z.coerce.number() });
const filaVolumenSchema = z.object({
  mensajesPorConversacion: z.coerce.number(),
  tasaAbandono: z.coerce.number(),
});

export async function calcularAgente(
  desde: Date | null,
): Promise<{ modelos: UsoModelo[]; tools: UsoTool[]; latencia: Latencia }> {
  const [modelosRaw, toolsRaw, latenciaRaw] = await Promise.all([
    prisma.$queryRaw`
      SELECT COALESCE(s.attributes->>'model', 'desconocido') AS modelo,
             COALESCE(SUM((s.attributes->'usage'->>'inputTokens')::numeric), 0)::float8 AS "tokensEntrada",
             COALESCE(SUM((s.attributes->'usage'->>'outputTokens')::numeric), 0)::float8 AS "tokensSalida"
      FROM mastra.mastra_ai_spans s
      ${JOIN_REALES}
      WHERE s."spanType" = 'model_generation'
        AND (${desde}::timestamptz IS NULL OR s."startedAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY "tokensEntrada" DESC`,
    prisma.$queryRaw`
      SELECT COALESCE(s."entityName", s.name) AS tool, COUNT(*)::float8 AS llamadas
      FROM mastra.mastra_ai_spans s
      ${JOIN_REALES}
      WHERE s."spanType" = 'tool_call'
        AND (${desde}::timestamptz IS NULL OR s."startedAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY llamadas DESC`,
    prisma.$queryRaw`
      SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) * 1000), 0)::float8 AS "p50Ms",
             COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (s."endedAt" - s."startedAt")) * 1000), 0)::float8 AS "p95Ms"
      FROM mastra.mastra_ai_spans s
      ${JOIN_REALES}
      WHERE s."spanType" = 'agent_run'
        AND s."endedAt" IS NOT NULL
        AND (${desde}::timestamptz IS NULL OR s."startedAt" >= ${desde}::timestamptz)`,
  ]);

  const modelos = filaModeloSchema
    .array()
    .parse(modelosRaw)
    .map((fila) => ({
      ...fila,
      costoUsd: estimarCostoUsd(fila.modelo, fila.tokensEntrada, fila.tokensSalida),
    }));

  const latencia = filaLatenciaSchema.array().parse(latenciaRaw)[0] ?? { p50Ms: 0, p95Ms: 0 };

  return { modelos, tools: filaToolSchema.array().parse(toolsRaw), latencia };
}

export async function calcularVolumen(desde: Date | null): Promise<Volumen> {
  const [porDiaRaw, porHoraRaw, agregadosRaw] = await Promise.all([
    prisma.$queryRaw`
      SELECT to_char(c."createdAt", 'YYYY-MM-DD') AS fecha, COUNT(*)::float8 AS valor
      FROM "Conversation" c
      WHERE ${WHERE_REALES}
        AND (${desde}::timestamptz IS NULL OR c."createdAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY 1 ASC`,
    prisma.$queryRaw`
      SELECT EXTRACT(HOUR FROM c."createdAt")::float8 AS hora,
             COUNT(*)::float8 AS conversaciones
      FROM "Conversation" c
      WHERE ${WHERE_REALES}
        AND (${desde}::timestamptz IS NULL OR c."createdAt" >= ${desde}::timestamptz)
      GROUP BY 1
      ORDER BY 1 ASC`,
    prisma.$queryRaw`
      WITH por_conversacion AS (
        SELECT c.id,
               COUNT(s.id) FILTER (WHERE s.role = 'user')::float8 AS mensajes_usuario,
               COUNT(s.id)::float8 AS mensajes
        FROM "Conversation" c
        LEFT JOIN mastra.mastra_messages s ON s.thread_id = c."threadId"
        WHERE ${WHERE_REALES}
          AND (${desde}::timestamptz IS NULL OR c."createdAt" >= ${desde}::timestamptz)
        GROUP BY c.id
      )
      SELECT COALESCE(AVG(mensajes), 0)::float8 AS "mensajesPorConversacion",
             COALESCE(
               COUNT(*) FILTER (WHERE mensajes_usuario <= 1)::float8 / NULLIF(COUNT(*), 0),
               0
             )::float8 AS "tasaAbandono"
      FROM por_conversacion`,
  ]);

  const agregados = filaVolumenSchema.array().parse(agregadosRaw)[0] ?? {
    mensajesPorConversacion: 0,
    tasaAbandono: 0,
  };

  return {
    porDia: filaSerieSchema.array().parse(porDiaRaw),
    porHora: filaHoraSchema.array().parse(porHoraRaw),
    ...agregados,
  };
}
