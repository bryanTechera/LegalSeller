import { z } from "zod";

export const accesoRevisionSchema = z.object({
  clave: z.string().min(1, "no puede estar vacía"),
  nombre: z.string().trim().min(2, "es demasiado corto").max(60, "es demasiado largo"),
});
export type AccesoRevisionInput = z.infer<typeof accesoRevisionSchema>;

export const crearSesionSchema = z.object({
  titulo: z.string().trim().min(1).max(120).optional(),
  /** "autonoma" = corrida del runner de escenarios; ausente = sesión de experto. */
  origen: z.literal("autonoma").optional(),
});
export type CrearSesionInput = z.infer<typeof crearSesionSchema>;

export const publicarSesionSchema = z.object({
  borrador: z.literal(false),
});
export type PublicarSesionInput = z.infer<typeof publicarSesionSchema>;

export const mensajeRevisionSchema = z.object({
  message: z.string().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
});
export type MensajeRevisionInput = z.infer<typeof mensajeRevisionSchema>;

export const crearNotaSchema = z.object({
  texto: z.string().trim().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
  messageId: z.string().min(1).optional(),
  citaTexto: z.string().max(2000).optional(),
});
export type CrearNotaInput = z.infer<typeof crearNotaSchema>;

export const responderNotaSchema = z.object({
  texto: z.string().trim().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
});
export type ResponderNotaInput = z.infer<typeof responderNotaSchema>;

export const resolverNotaSchema = z.object({
  estado: z.literal("RESUELTA"),
});
export type ResolverNotaInput = z.infer<typeof resolverNotaSchema>;
