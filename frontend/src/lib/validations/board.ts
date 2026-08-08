import { z } from "zod";

import { rangoSchema } from "@/lib/board/rango";

export const filtrosChatsSchema = z.object({
  rango: rangoSchema.default("30d"),
  categoria: z.string().min(1).optional(),
  estado: z.enum(["EN_CONVERSACION", "CAPTADO", "FUERA_DE_COBERTURA"]).optional(),
  busqueda: z.string().min(2).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

export type FiltrosChats = z.infer<typeof filtrosChatsSchema>;

/** Nota del equipo legal sobre un caso. El autor sale de la sesión, no del body. */
export const crearNotaCasoSchema = z.object({
  texto: z.string().min(1).max(4000),
});
