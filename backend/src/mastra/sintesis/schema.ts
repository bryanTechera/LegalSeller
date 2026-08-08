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

/**
 * Lo que el BFF manda para resumir: el caso y su conversación completa.
 *
 * Las fechas (`abiertoEn` y la `fecha` de cada mensaje) son el anclaje temporal
 * del modelo, y son lo que le da referente a la regla de `PROMPT_SINTESIS`
 * sobre las fechas entre corchetes. Medido sobre un caso real: con el anclaje
 * y esa regla, 20 de 20 generaciones dejaron la fecha como la dijo la persona
 * ("15 de julio"); sacando la regla —y con ella el sentido del anclaje— 2 de 6
 * volvieron a escribir "15 de julio de 2026". Van juntos: el campo sin la regla
 * no sirve, y la regla sin el campo habla de algo que no está.
 *
 * Viajan como ISO y se toleran ausentes: un transcript viejo puede no
 * traerlas, y una síntesis sin fechas es mejor que un 400.
 */
export const materialSchema = z.object({
  caso: z.object({
    categoria: z.string().nullable(),
    subcategorias: z.array(z.string()).default([]),
    estado: z.string(),
    /** Lo que los agentes fueron dejando en `Caso.resumen` (brief + hechos). */
    resumen: z.string().nullable(),
    /** Cuándo se abrió el caso, en ISO. */
    abiertoEn: z
      .string()
      .nullish()
      .transform((valor) => valor ?? null),
  }),
  mensajes: z
    .array(
      z.object({
        rol: z.enum(["user", "assistant"]),
        texto: z.string(),
        /** Cuándo se escribió el mensaje, en ISO. */
        fecha: z
          .string()
          .nullish()
          .transform((valor) => valor ?? null),
      }),
    )
    .min(1),
});

export type MaterialSintesis = z.infer<typeof materialSchema>;
