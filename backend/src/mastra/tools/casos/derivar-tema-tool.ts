import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Signal tool: el agente MARCA un asunto de otra área; el receptor clasifica.
 * El BFF observa el tool-call en el stream SSE y corre el receptor sobre el
 * MISMO mensaje del usuario — execute no toca la DB. Un falso positivo es
 * inofensivo (el receptor lo clasifica en la misma categoría y no se abre
 * ningún caso), así que el contrato favorece marcar de más.
 */
export const derivarTemaTool = createTool({
  id: "derivar-tema",
  description: `Marcá que el usuario trajo un asunto de OTRA área legal, además del que venís atendiendo. Un tema de tu misma área, aunque toque otra subcategoría, seguí atendiéndolo vos sin marcar. Pasá el tema en las palabras del usuario: la clasificación no la hacés vos. Ante la duda de si el asunto cae fuera de tu área, marcá igual — si termina siendo tuyo no pasa nada, pero el que no marcás se pierde como caso.`,
  inputSchema: z.object({
    tema: z.string().min(1).meta({ description: "El asunto nuevo en las palabras del usuario" }),
  }),
  // Las dos ramas comparten shape, así que un enum alcanza y evita la unión.
  outputSchema: z.object({ status: z.enum(["ok", "error"]), mensaje: z.string() }),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async () => ({
    status: "ok" as const,
    mensaje:
      "Tema derivado. Cerrá con una frase puente que reconozca el asunto nuevo; el especialista que corresponde entra en el próximo mensaje.",
  }),
});
