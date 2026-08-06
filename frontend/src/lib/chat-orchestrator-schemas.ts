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

/**
 * Campo opcional que además acepta `null` como "no vino".
 *
 * No es laxitud gratuita: cómo se expresa "no tengo este dato" depende de la
 * FAMILIA del modelo. Gemini omite la clave; GPT-5.6 —los agentes de categoría
 * desde el 2026-08-02— la manda con `null` explícito. Con `.optional()` puro un
 * solo `contactoEmail: null` invalida el objeto entero, y como el observador
 * descarta la llamada COMPLETA ante un parseo fallido, se perdían los campos
 * que sí venían al lado (`registrar-caso` devuelve `ok` igual: es una tool
 * señal, no escribe nada). Costó un lead real y 25 de 71 tool-calls en
 * producción antes de detectarse.
 *
 * `null` se normaliza a `undefined` porque es lo que esperan las firmas de
 * `clasificacion.ts`. La estrictez de FORMA no se toca: un `subcategorias`
 * string en vez de array sigue siendo rechazo.
 *
 * El `.optional()` va POR FUERA del transform a propósito: un `ZodPipe` en el
 * tope del campo hace que `z.infer` emita la clave como presente-y-`undefined`
 * (`k: T | undefined`) en vez de opcional (`k?: T`), y eso rompe a cualquiera
 * que construya el objeto omitiendo campos.
 */
function opcional<T extends z.ZodType>(
  schema: T,
): z.ZodOptional<z.ZodPipe<z.ZodNullable<T>, z.ZodTransform<z.output<T> | undefined, z.output<T> | null>>> {
  return schema
    .nullable()
    .transform((valor) => valor ?? undefined)
    .optional();
}

export const asignacionArgsSchema = z.object({
  categoria: z.string().min(1),
  subcategoria: opcional(z.string()),
  brief: opcional(z.string()),
  casoSensible: opcional(z.boolean()),
  temaDetectado: opcional(z.string()),
  confianza: opcional(z.string()),
});
export type AsignacionArgs = z.infer<typeof asignacionArgsSchema>;

export const registrarCasoArgsSchema = z.object({
  subcategorias: opcional(z.array(z.string())),
  hechos: opcional(z.string()),
  contactoNombre: opcional(z.string()),
  contactoTelefono: opcional(z.string()),
  contactoEmail: opcional(z.string()),
});
export type RegistrarCasoArgs = z.infer<typeof registrarCasoArgsSchema>;

export const correccionArgsSchema = z.object({
  categoria: z.string().min(1),
  motivo: z.string().min(1),
});
export type CorreccionArgs = z.infer<typeof correccionArgsSchema>;

export const derivarTemaArgsSchema = z.object({ tema: z.string().min(1) });
export type DerivarTemaArgs = z.infer<typeof derivarTemaArgsSchema>;
