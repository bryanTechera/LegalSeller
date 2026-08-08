import { z } from "zod";

/**
 * Espejo de `backend/src/mastra/sintesis/schema.ts`. Vive dos veces porque
 * backend y frontend son paquetes pnpm separados, sin workspace que los una —
 * mismo caso que `chat-orchestrator-schemas.ts`, que valida args de tools
 * definidas del otro lado. Regla para que no se desincronicen: tolerante en
 * los opcionales, estricto en la forma, y un cambio de campo toca los dos
 * archivos en el mismo commit.
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
 * Espejo de `materialSchema` del backend, incluido el `.default([])` de
 * `subcategorias` (estaba solo del lado del backend: una divergencia chica
 * pero real entre dos schemas que tienen que decir lo mismo).
 *
 * Las fechas son el anclaje temporal del modelo — el referente de la regla de
 * `PROMPT_SINTESIS` sobre las fechas entre corchetes. Ver el comentario del
 * schema del backend para la medición que las justifica.
 */
export const materialSchema = z.object({
  caso: z.object({
    categoria: z.string().nullable(),
    subcategorias: z.array(z.string()).default([]),
    estado: z.string(),
    resumen: z.string().nullable(),
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
        fecha: z
          .string()
          .nullish()
          .transform((valor) => valor ?? null),
      }),
    )
    .min(1),
});

export type MaterialSintesis = z.infer<typeof materialSchema>;

/** Respuesta del endpoint del backend. */
export const respuestaSintesisSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), sintesis: sintesisSchema, modelo: z.string() }),
  z.object({ status: z.literal("error"), mensaje: z.string() }),
]);
