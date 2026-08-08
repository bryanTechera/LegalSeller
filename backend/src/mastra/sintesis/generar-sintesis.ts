import { gateway } from "@ai-sdk/gateway";
import { generateText, Output, type LanguageModel } from "ai";

import { makeLogger } from "../common/logger.js";
import { MODELO_SINTESIS } from "../config/modelos.js";

import { PROMPT_SINTESIS, formatearMaterial } from "./prompt.js";
import { sintesisSchema, type MaterialSintesis, type Sintesis } from "./schema.js";

const logger = makeLogger("Sintesis");

export type ResultadoSintesis =
  | { status: "ok"; sintesis: Sintesis; modelo: string }
  | { status: "error"; mensaje: string };

/** Inyectable para poder testear sin gateway ni red. */
export type GenerarObjeto = (opciones: {
  model: unknown;
  schema: typeof sintesisSchema;
  system: string;
  prompt: string;
  temperature: number;
  providerOptions: Record<string, unknown>;
}) => Promise<{ object: unknown }>;

/**
 * `generateObject` está deprecado en el SDK instalado (`ai@6`) a favor de
 * `generateText` con `output: Output.object(...)` — el resultado equivalente
 * vive en `resultado.output` en vez de en `resultado.object`. Este adaptador
 * mantiene la forma `{ object }` que espera `GenerarObjeto` (y que testean los
 * mocks) sin depender de la API deprecada.
 */
const generarConGateway: GenerarObjeto = async (opciones) => {
  const resultado = await generateText({
    model: opciones.model as LanguageModel,
    system: opciones.system,
    prompt: opciones.prompt,
    temperature: opciones.temperature,
    providerOptions: opciones.providerOptions,
    output: Output.object({ schema: opciones.schema }),
  });
  return { object: resultado.output };
};

/**
 * Resume un caso. Nunca tira: el error viaja como valor, igual que en las
 * tools de agente — una excepción acá tumbaría la vista del caso, y la
 * síntesis es una comodidad, no un requisito de integridad.
 *
 * `temperature: 1` y el orden de proveedor son los knobs de Gemini vía
 * gateway, los mismos que `opcionesDeModelo` resuelve para los agentes. Van
 * escritos acá porque esta llamada no pasa por `crearAgente`: si algún día el
 * rol cambia de familia, este bloque se mueve con él.
 */
export async function generarSintesis(
  material: MaterialSintesis,
  deps?: { generar?: GenerarObjeto },
): Promise<ResultadoSintesis> {
  const generar = deps?.generar ?? generarConGateway;
  try {
    const { object } = await generar({
      model: gateway(MODELO_SINTESIS),
      schema: sintesisSchema,
      system: PROMPT_SINTESIS,
      prompt: formatearMaterial(material),
      temperature: 1,
      providerOptions: { gateway: { order: ["google", "vertex"] } },
    });

    const validado = sintesisSchema.safeParse(object);
    if (!validado.success) {
      // Solo las rutas de Zod, nunca los valores: el objeto trae el relato del
      // consultante.
      logger.warn("síntesis descartada por forma inválida", {
        campos: validado.error.issues.map((issue) => issue.path.join(".")),
      });
      return { status: "error", mensaje: "No se pudo generar la síntesis" };
    }

    return { status: "ok", sintesis: validado.data, modelo: MODELO_SINTESIS };
  } catch (error) {
    logger.error("generación de síntesis falló", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", mensaje: "No se pudo generar la síntesis" };
  }
}
