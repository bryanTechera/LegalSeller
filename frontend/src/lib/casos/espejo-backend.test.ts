import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * `PROMPT_VERSION` y el id del modelo viven dos veces —en el backend, donde se
 * usan, y en `sintesis.ts`, donde entran en la huella— y hasta acá nada
 * comparaba los pares. La desincronización no rompe nada visible: deja
 * vigentes síntesis generadas con el prompt o el modelo viejo, en silencio,
 * que es exactamente el modo de falla que la huella existe para evitar.
 *
 * El test lee los archivos como texto en vez de importar el módulo del
 * backend: son dos paquetes pnpm distintos (NodeNext con sufijos `.js` de un
 * lado, alias `@/` del otro) y el import cruzado no resuelve. Comparar los
 * literales alcanza — son los mismos que se compilan.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const ESPEJO_FRONT = resolve(AQUI, "sintesis.ts");
const FUENTE_PROMPT = resolve(AQUI, "../../../../backend/src/mastra/sintesis/prompt.ts");
const FUENTE_MODELOS = resolve(AQUI, "../../../../backend/src/mastra/config/modelos.ts");

function leer(ruta: string): string {
  return readFileSync(ruta, "utf8");
}

function capturar(texto: string, patron: RegExp, que: string): string {
  const encontrado = patron.exec(texto);
  if (encontrado?.[1] === undefined) {
    throw new Error(`No se pudo leer ${que} — cambió la forma de la declaración, actualizá este test`);
  }
  return encontrado[1];
}

describe("espejos del backend en la huella de la síntesis", () => {
  const frontend = leer(ESPEJO_FRONT);

  it("PROMPT_VERSION dice lo mismo de los dos lados", () => {
    const backend = capturar(
      leer(FUENTE_PROMPT),
      /export const PROMPT_VERSION = "([^"]+)"/,
      "PROMPT_VERSION del backend",
    );
    const espejo = capturar(frontend, /const PROMPT_VERSION = "([^"]+)"/, "PROMPT_VERSION del frontend");

    expect(espejo).toBe(backend);
  });

  it("el modelo de síntesis dice lo mismo de los dos lados", () => {
    const backend = capturar(
      leer(FUENTE_MODELOS),
      /export const MODELO_SINTESIS = "([^"]+)"/,
      "MODELO_SINTESIS del backend",
    );
    const espejo = capturar(frontend, /const MODELO = "([^"]+)"/, "el modelo del frontend");

    expect(espejo).toBe(backend);
  });
});
