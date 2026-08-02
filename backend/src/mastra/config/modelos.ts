/**
 * Model stack por rol. Un modelo por ROL, no por agente: los cinco agentes de
 * categoría comparten la misma forma de trabajo (conversar, encadenar tools,
 * fundar la respuesta en el texto recuperado) y no hay razón para que difieran.
 *
 * Los precios reales salen del catálogo del gateway — que es quien factura —,
 * no de la doc del proveedor. La tabla que consume el board vive en
 * `frontend/src/lib/board/costos.ts` y tiene que moverse junto con este archivo:
 * un modelo ausente de esa tabla deja el costo del board en "sin dato".
 */

/**
 * Receptor. Su generación entera es tiempo muerto: el orquestador la bufferea
 * completa para leer el tool-call de `asignar-clasificacion` y recién ahí
 * encadena al agente de categoría, así que el usuario mira una pantalla vacía
 * mientras corre. Por eso el criterio es throughput, no inteligencia — y el
 * tier lite, que no hace thinking extendido por default, mantiene esa latencia
 * predecible en vez de tener una cola larga cuando el modelo decide razonar.
 */
export const MODELO_RECEPCION = "google/gemini-3.5-flash-lite";

/**
 * Agentes de categoría. Modelo de razonamiento con el effort en `low`: la
 * respuesta se streamea, así que lo único que se percibe es el TTFT.
 *
 * El criterio es fidelidad al texto recuperado bajo un prompt largo (prompt
 * ensamblado + chunks del corpus + historia), que es donde vive el modo de
 * falla principal del producto — afirmar un plazo o un artículo que el corpus
 * no trae — y el encadenado de tools dentro del mismo turno
 * (`buscar-documentos` -> `registrar-caso` -> `corregir-clasificacion`).
 */
export const MODELO_ESPECIALISTA = "openai/gpt-5.6-luna";
