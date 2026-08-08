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

export const materialSchema = z.object({
  caso: z.object({
    categoria: z.string().nullable(),
    subcategorias: z.array(z.string()),
    estado: z.string(),
    resumen: z.string().nullable(),
  }),
  mensajes: z.array(z.object({ rol: z.enum(["user", "assistant"]), texto: z.string() })).min(1),
});

export type MaterialSintesis = z.infer<typeof materialSchema>;

/** Respuesta del endpoint del backend. */
export const respuestaSintesisSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), sintesis: sintesisSchema, modelo: z.string() }),
  z.object({ status: z.literal("error"), mensaje: z.string() }),
]);
