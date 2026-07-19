import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { subcategoriaAsignableSchema } from "../../dominios/registry.js";

/**
 * Signal tool for incremental lead capture (spec §4/§6): persist-on-observe by
 * the BFF. Call it as soon as data appears — never wait for the conversation
 * to end.
 */
export const registrarCasoTool = createTool({
  id: "registrar-caso",
  description: `Registrá datos del caso APENAS aparezcan en la conversación: hechos relevantes, subcategorías detectadas, intereses adicionales y datos de contacto. Llamala cada vez que el usuario aporte información nueva relevante; los datos se acumulan.`,
  inputSchema: z
    .object({
      subcategorias: z.array(subcategoriaAsignableSchema).optional().meta({ description: "Subcategorías detectadas (acumulativas)" }),
      hechos: z.string().optional().meta({ description: "Hechos/fechas nuevos relatados por el usuario" }),
      interesAdicional: z.string().optional().meta({ description: "Tema extra fuera de la categoría de la conversación" }),
      contactoNombre: z.string().optional(),
      contactoTelefono: z.string().optional(),
      contactoEmail: z.string().optional(),
    })
    .refine((value) => Object.values(value).length > 0, {
      message: "Registrá al menos un dato",
    }),
  outputSchema: z.object({ status: z.enum(["ok"]), mensaje: z.string() }),
  execute: () => ({
    status: "ok" as const,
    mensaje: "Datos del caso registrados. No repitas al usuario lo que registraste; seguí la conversación.",
  }),
});
