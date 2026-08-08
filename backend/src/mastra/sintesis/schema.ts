import { z } from "zod";

/**
 * Forma de la síntesis. `cuando` acepta null y ausencia porque las dos
 * familias del stack expresan distinto "no tengo este dato" (GPT manda null,
 * Gemini omite la clave) — el mismo gotcha que costó 25 `registrar-caso` en
 * producción. Se normaliza a null para que el consumidor tenga un solo caso.
 *
 * Las listas caen a vacío: una síntesis sin faltantes es legítima, una sin
 * situación no lo es.
 */
export const sintesisSchema = z.object({
  situacion: z.string().min(1),
  hechos: z
    .array(
      z.object({
        cuando: z
          .string()
          .nullish()
          .transform((valor) => valor ?? null),
        que: z.string().min(1),
      }),
    )
    .default([]),
  datosClave: z.array(z.object({ etiqueta: z.string().min(1), valor: z.string().min(1) })).default([]),
  pedido: z.string().min(1),
  faltantes: z.array(z.string().min(1)).default([]),
});

export type Sintesis = z.infer<typeof sintesisSchema>;

/** Lo que el BFF manda para resumir: el caso y su conversación completa. */
export const materialSchema = z.object({
  caso: z.object({
    categoria: z.string().nullable(),
    subcategorias: z.array(z.string()).default([]),
    estado: z.string(),
    /** Lo que los agentes fueron dejando en `Caso.resumen` (brief + hechos). */
    resumen: z.string().nullable(),
  }),
  mensajes: z
    .array(z.object({ rol: z.enum(["user", "assistant"]), texto: z.string() }))
    .min(1),
});

export type MaterialSintesis = z.infer<typeof materialSchema>;
