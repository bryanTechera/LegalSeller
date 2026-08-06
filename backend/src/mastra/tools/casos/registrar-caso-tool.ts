import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { subcategoriaAsignableSchema, subcategoriasDeCategoriaSchema } from "../../dominios/registry.js";

/**
 * Signal tool for incremental lead capture (spec §4/§6): persist-on-observe by
 * the BFF. Call it as soon as data appears — never wait for the conversation
 * to end.
 *
 * Factory: cada especialista de categoría ve solo sus propias subcategorías
 * (`categoriaId` acota el enum) — el receptor, sin argumento, mantiene el
 * enum completo porque clasifica hacia cualquier categoría.
 */
export function crearRegistrarCasoTool(categoriaId?: string) {
  const subcategoriaSchema =
    categoriaId === undefined ? subcategoriaAsignableSchema : subcategoriasDeCategoriaSchema(categoriaId);

  const baseShape = {
    hechos: z.string().optional().meta({ description: "Hechos/fechas nuevos relatados por el usuario" }),
    contactoNombre: z.string().optional(),
    contactoTelefono: z.string().optional(),
    contactoEmail: z.string().optional(),
  };

  const shape =
    subcategoriaSchema === undefined
      ? baseShape
      : {
          subcategorias: z
            .array(subcategoriaSchema)
            .optional()
            .meta({ description: "Subcategorías detectadas (acumulativas)" }),
          ...baseShape,
        };

  return createTool({
    id: "registrar-caso",
    description: `Registrá datos del caso APENAS aparezcan en la conversación: hechos relevantes, subcategorías detectadas y datos de contacto.`,
    inputSchema: z.object(shape).refine(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Zod keeps explicitly-undefined keys — the check is real
      (value) => Object.values(value).some((v) => v !== undefined),
      { message: "Registrá al menos un dato" },
    ),
    outputSchema: z.object({ status: z.enum(["ok"]), mensaje: z.string() }),
    // eslint-disable-next-line @typescript-eslint/require-await
    execute: async () => ({
      status: "ok" as const,
      mensaje: "Datos del caso registrados. No repitas al usuario lo que registraste; seguí la conversación.",
    }),
  });
}

/** Versión del receptor: ve todas las subcategorías porque clasifica hacia cualquier categoría. */
export const registrarCasoTool = crearRegistrarCasoTool();
