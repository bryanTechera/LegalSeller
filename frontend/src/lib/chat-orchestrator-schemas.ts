import "server-only";

import { z } from "zod";

/**
 * Tool-call `args` observed off the agent SSE stream are LLM output crossing a
 * trust boundary into persistence (Prisma) — never trusted as already-typed
 * `unknown`. Lax on values (enum membership is the backend tool's job, already
 * enforced there via `inputSchema`), strict on shape/types: this is only the
 * BFF's second line of defense against a malformed or adversarial payload
 * reaching `clasificacion.ts`.
 */

export const asignacionArgsSchema = z.object({
  categoria: z.string().min(1),
  subcategoria: z.string().optional(),
  brief: z.string().optional(),
  casoSensible: z.boolean().optional(),
  temaDetectado: z.string().optional(),
  confianza: z.string().optional(),
});
export type AsignacionArgs = z.infer<typeof asignacionArgsSchema>;

export const registrarCasoArgsSchema = z.object({
  subcategorias: z.array(z.string()).optional(),
  hechos: z.string().optional(),
  interesAdicional: z.string().optional(),
  contactoNombre: z.string().optional(),
  contactoTelefono: z.string().optional(),
  contactoEmail: z.string().optional(),
});
export type RegistrarCasoArgs = z.infer<typeof registrarCasoArgsSchema>;

export const correccionArgsSchema = z.object({
  categoria: z.string().min(1),
  motivo: z.string().min(1),
});
export type CorreccionArgs = z.infer<typeof correccionArgsSchema>;
