import { z } from "zod";

export const sendMessageSchema = z.object({
  message: z.string().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
