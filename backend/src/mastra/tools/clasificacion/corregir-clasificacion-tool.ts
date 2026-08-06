import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { categoriasHabilitadas } from "../../dominios/registry.js";

const categoriaHabilitadaSchema = z.enum(
  categoriasHabilitadas().map((c) => c.id) as [string, ...string[]],
);

/**
 * Signal tool: bounded reclassification (max one per conversation — the BFF
 * enforces the limit and records the audit trail, spec §6).
 */
export const corregirClasificacionTool = createTool({
  id: "corregir-clasificacion",
  description: `Usala cuando sea evidente que la conversación quedó en el área equivocada y el problema real es de otra materia. Un tema adicional NO es un error de área: eso va como interesAdicional en registrar-caso.`,
  inputSchema: z.object({
    categoria: categoriaHabilitadaSchema.meta({ description: "Categoría correcta" }),
    motivo: z.string().min(1).meta({ description: "Por qué la clasificación anterior fue un error" }),
  }),
  outputSchema: z.object({ status: z.enum(["ok"]), mensaje: z.string() }),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async () => ({
    status: "ok" as const,
    mensaje: "Corrección registrada.",
  }),
});
