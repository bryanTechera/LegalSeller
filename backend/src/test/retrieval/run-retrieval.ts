/**
 * Eval de retrieval: mide qué devuelve el corpus, sin invocar ningún agente.
 *
 * Positivos: `esperado` lista títulos de documentos; el item pasa si alguno
 * aparece en el top-5 (el limit default del agente). Se reporta también el
 * recall@20, que no se gatea — alimenta la decisión sobre reranking.
 *
 * Negativos: `esperado` vacío afirma que la consulta no debería traer nada de
 * esa partición. El item pasa si el resultado queda estrictamente vacío tras
 * aplicar MIN_SIMILARITY. Con el umbral sin calibrar fallan todos, por
 * construcción: nada del corpus puntúa por debajo de 0,3.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { generateEmbedding, toVectorLiteral } from "../../mastra/config/embedding.js";
import { getPool } from "../../mastra/config/storage.js";
import { buildSearchQuery, MIN_SIMILARITY } from "../../mastra/tools/documentos/buscar-documentos-tool.js";

const itemSchema = z.object({
  consulta: z.string().min(1),
  categoria: z.string().min(1),
  subcategorias: z.array(z.string()).optional(),
  /** Títulos esperados. Vacío = item negativo: el resultado debe quedar vacío. */
  esperado: z.array(z.string()),
});

type ItemRetrieval = z.infer<typeof itemSchema>;

interface Recuperado {
  titulo: string;
  similarity: number;
}

async function recuperar(item: ItemRetrieval, limit: number, minSimilarity: number): Promise<Recuperado[]> {
  // Mismo régimen de embedding que buscar-documentos: si el eval embebiera la
  // consulta con un taskType que la tool no usa, mediría un sistema que no es
  // el que corre en producción. La Tarea 12 los mueve a los dos a la vez.
  const embedding = await generateEmbedding(item.consulta);
  const { sql, params } = buildSearchQuery({
    vector: toVectorLiteral(embedding),
    minSimilarity,
    limit,
    categoria: item.categoria,
    subcategorias: item.subcategorias,
  });
  const { rows } = await getPool().query<{ document_title: string; similarity: number }>(sql, params);
  return rows.map((row) => ({ titulo: row.document_title, similarity: row.similarity }));
}

/** Runs one category's dataset. Returns the gated score: recall@5 over positives, empty-rate over negatives. */
export async function evalRetrieval(categoria: string, etiqueta: string): Promise<number> {
  const datasetPath = join(dirname(fileURLToPath(import.meta.url)), `datasets/${categoria}.json`);
  const items = z.array(itemSchema).parse(JSON.parse(readFileSync(datasetPath, "utf8")) as unknown);

  const positivos = items.filter((item) => item.esperado.length > 0);
  const negativos = items.filter((item) => item.esperado.length === 0);

  let aciertos5 = 0;
  let aciertos20 = 0;
  const fallas: string[] = [];
  const similitudesDeAcierto: number[] = [];

  for (const item of positivos) {
    const top20 = await recuperar(item, 20, MIN_SIMILARITY);
    const indice = top20.findIndex((r) => item.esperado.includes(r.titulo));
    if (indice >= 0 && indice < 5) {
      aciertos5 += 1;
      similitudesDeAcierto.push(top20[indice].similarity);
    } else if (indice >= 0) {
      aciertos20 += 1;
      fallas.push(`"${item.consulta}" → esperado en posición ${String(indice + 1)}, fuera del top-5`);
    } else {
      fallas.push(`"${item.consulta}" → ninguno de [${item.esperado.join(" | ")}] en el top-20`);
    }
  }
  aciertos20 += aciertos5;

  let vacios = 0;
  const similitudesDeNegativo: number[] = [];
  for (const item of negativos) {
    const top5 = await recuperar(item, 5, MIN_SIMILARITY);
    if (top5.length === 0) vacios += 1;
    else {
      similitudesDeNegativo.push(top5[0].similarity);
      fallas.push(`"${item.consulta}" → debía quedar vacío, trajo ${String(top5.length)} a ${top5[0].similarity.toFixed(3)}`);
    }
  }

  const recall5 = positivos.length === 0 ? 1 : aciertos5 / positivos.length;
  const recall20 = positivos.length === 0 ? 1 : aciertos20 / positivos.length;
  const tasaVacio = negativos.length === 0 ? 1 : vacios / negativos.length;

  const minimo = (xs: number[]): string => (xs.length === 0 ? "n/a" : Math.min(...xs).toFixed(3));
  const maximo = (xs: number[]): string => (xs.length === 0 ? "n/a" : Math.max(...xs).toFixed(3));

  console.log(
    `\n[retrieval-${etiqueta}] recall@5=${recall5.toFixed(3)} recall@20=${recall20.toFixed(3)} ` +
      `vacío-correcto=${tasaVacio.toFixed(3)} (${String(positivos.length)} positivos, ${String(negativos.length)} negativos)`,
  );
  console.log(
    `  calibración: piso de positivos acertados=${minimo(similitudesDeAcierto)} · ` +
      `techo de negativos=${maximo(similitudesDeNegativo)}`,
  );
  for (const falla of fallas) console.log(`  FAIL: ${falla}`);

  return Math.min(recall5, tasaVacio);
}
