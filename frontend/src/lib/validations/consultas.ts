import { z } from "zod";

export const createConsultaSchema = z.object({
  // IDs are validated as non-empty strings + ownership query, never by format.
  title: z.string().min(1, "no puede estar vacío").max(200, "es demasiado largo").optional(),
});

export type CreateConsultaInput = z.infer<typeof createConsultaSchema>;

export const sendMessageSchema = z.object({
  consultaId: z.string().min(1, "es requerido"),
  message: z.string().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
