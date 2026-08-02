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
