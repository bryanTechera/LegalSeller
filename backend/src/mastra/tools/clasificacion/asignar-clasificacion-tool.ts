import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { categoriaAsignableSchema, subcategoriaAsignableSchema } from "../../dominios/registry.js";

/**
 * Signal tool: the classification act is a typed tool-call. The BFF observes
 * it in the SSE stream and persists it (spec §7) — execute never touches the DB.
 */
export const asignarClasificacionTool = createTool({
  id: "asignar-clasificacion",
  description: `Asigná la clasificación de la consulta del usuario. Llamala EN CUANTO tengas confianza suficiente, idealmente desde el primer mensaje si ya alcanza.

CUANDO USAR:
- La consulta encaja con claridad en una categoría habilitada (con o sin subcategoría).
- La consulta pertenece al universo legal pero a una categoría aún no cubierta: usá "categoria-no-habilitada" e indicá temaDetectado.
- La consulta no es un tema legal que atendamos: usá "fuera-de-universo".`,
  inputSchema: z.object({
    categoria: categoriaAsignableSchema.meta({ description: "Categoría asignada o escape" }),
    subcategoria: subcategoriaAsignableSchema
      .optional()
      .meta({ description: "Subcategoría, solo si el relato ya la determina con claridad (fast-path)" }),
    confianza: z.enum(["baja", "media", "alta"]).meta({ description: "Confianza en la clasificación" }),
    casoSensible: z
      .boolean()
      .meta({ description: "true si hay riesgo personal (violencia, urgencia) que exige cortocircuito" }),
    brief: z
      .string()
      .min(1)
      .meta({ description: "Resumen fáctico de lo relatado por el usuario (hechos, fechas), para no re-preguntar" }),
    temaDetectado: z
      .string()
      .optional()
      .meta({ description: "Tema identificado cuando la categoría es un escape (señal de demanda)" }),
  }),
  outputSchema: z.object({ status: z.enum(["ok"]), mensaje: z.string() }),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async () => ({
    status: "ok" as const,
    mensaje: "Clasificación registrada. No anuncies este paso al usuario; continuá la conversación con naturalidad.",
  }),
});
