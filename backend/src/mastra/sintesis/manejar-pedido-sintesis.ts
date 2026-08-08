import { makeLogger } from "../common/logger.js";

import { generarSintesis } from "./generar-sintesis.js";
import type { ResultadoSintesis } from "./generar-sintesis.js";
import { materialSchema } from "./schema.js";

const logger = makeLogger("Sintesis");

/** Cuerpo del error de respuesta cuando el request no cumple el contrato. */
interface ErrorMaterial {
  status: "error";
  mensaje: "Material inválido";
}

/**
 * Dispatch puro del endpoint `POST /sintesis-caso`: separado del handler de
 * Hono para que sea testeable sin levantar el server real. `leerBody` es
 * inyectable — normalmente `() => c.req.json()` — así este módulo también
 * cubre el caso de JSON malformado o vacío, que `c.req.json()` resuelve
 * tirando en vez de devolver un valor.
 *
 * Sin este wrapper, un body no-JSON llegaba al error handler default de
 * Mastra/Hono y salía como 500 `{"error":"Internal Server Error"}` — una
 * forma de respuesta distinta al contrato `ResultadoSintesis` que espera el
 * BFF para los demás casos de error.
 */
export async function manejarPedidoDeSintesis(
  leerBody: () => Promise<unknown>,
  deps?: { generarSintesis?: typeof generarSintesis },
): Promise<{ resultado: ResultadoSintesis | ErrorMaterial; status: 200 | 400 }> {
  const generar = deps?.generarSintesis ?? generarSintesis;

  let body: unknown;
  try {
    body = await leerBody();
  } catch (error) {
    logger.warn("sintesis-caso: body no es JSON válido", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { resultado: { status: "error", mensaje: "Material inválido" }, status: 400 };
  }

  const validado = materialSchema.safeParse(body);
  if (!validado.success) {
    return { resultado: { status: "error", mensaje: "Material inválido" }, status: 400 };
  }

  return { resultado: await generar(validado.data), status: 200 };
}
