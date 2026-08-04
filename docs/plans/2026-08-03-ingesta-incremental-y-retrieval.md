# Ingesta incremental y calidad del retrieval — diseño

**Fecha**: 2026-08-03
**Estado**: aprobado, pendiente de plan de implementación
**Alcance**: el pipeline RAG completo — ingesta del corpus (`pnpm ingest` → `pnpm corpus:sync`), umbral de similitud de `buscar-documentos`, y la decisión sobre incorporar reranking. No toca prompts, agentes ni clasificación.

---

## 1. Problema y objetivo

Tres cosas, en el orden en que las planteó el pedido original:

1. **La ingesta re-embebe todo, siempre.** `Document` no guarda ninguna huella del contenido, así que no hay forma de saber qué cambió. Cada corrida re-chunkea y re-embebe el corpus entero.
2. **El filtro de similitud no filtra.** `MIN_SIMILARITY = 0.3` en `backend/src/mastra/tools/documentos/buscar-documentos-tool.ts:9` es un número elegido a ojo con el comentario "calibrate with evals" — calibración que nunca se hizo.
3. **No se sabe si falta reranking.** Nunca se midió la calidad del retrieval, así que la pregunta no tiene respuesta con evidencia.

El objetivo no es sólo arreglar los tres puntos, sino dejarlos **medidos**: hoy no existe ninguna forma de saber si un cambio en el retrieval mejora o empeora el sistema.

### Por qué ahora

El corpus pasó de 46 documentos (ingesta de julio) a **155 documentos / 385 chunks** en seis semanas, cubriendo cinco categorías. La escala a la que estas tres deudas dejan de ser teóricas está cerca, y el costo de arreglarlas crece con el tamaño del corpus.

---

## 2. Estado medido (2026-08-03)

Todo lo que sigue está verificado contra la base real, no inferido.

**Corpus**: 155 documentos `READY`, 385 chunks, 579.390 caracteres (~150k tokens de embedding). Distribución: laboral 63, familia 43, arrendamiento-desalojo 24, relaciones-consumo 16, tránsito 9. Chunk mediano de 1505 caracteres contra un target de 2000 — la mayoría de los documentos entra casi entero.

**Drift corpus ↔ base**: cero en ambas direcciones (155 archivos `.md`, 155 filas).

**Base compartida**: los ocho worktrees del repo tienen el **mismo `DATABASE_URL`** (md5 idéntico de la línea en los ocho `backend/.env`). Cualquier sesión paralela escribe en la misma tabla `Document`.

**Escala real de similitud** — medida corriendo `buildSearchQuery` con el filtro `categoria: "arrendamiento-desalojo", subcategorias: ["arrendamiento-rural"]`:

| consulta | top-1 | top-5 |
|---|---|---|
| relevante — "arriendo un campo para ganadería y me quieren desalojar" | 0,759 | 0,718 |
| otro dominio — "me despidieron sin causa después de seis años" | 0,628 | 0,591 |
| absurda — "cuál es la receta de la tortilla de papas" | 0,511 | 0,491 |

Dos conclusiones, y la segunda corrige una hipótesis previa:

- **`MIN_SIMILARITY = 0.3` es código muerto.** El piso de la escala para una consulta sin ninguna relación con el corpus es 0,49. Nada va a caer nunca por debajo de 0,3.
- **La similitud sí discrimina.** Hay 0,25 de separación entre lo relevante y el absurdo, con el otro dominio prolijamente en el medio. La hipótesis inicial —que la ausencia de `taskType` colapsaba las similitudes en un cono sin señal— **queda desmentida**: la escala está corrida hacia arriba y comprimida, no rota. Eso degrada `taskType` de "la causa del problema" a "hipótesis con buen fundamento, a medir", y asciende la calibración del umbral a arreglo inmediato que no depende de re-embeber nada.

**Stack de modelos** (migrado el 2026-08-02, `backend/src/mastra/config/modelos.ts`): receptor `google/gemini-3.5-flash-lite`, los cinco agentes de categoría `openai/gpt-5.6-luna` con `reasoningEffort: "low"`. Embeddings siguen en `gemini-embedding-001` a 3072 dimensiones.

---

## 3. Decisiones tomadas

| Decisión | Elección | Alternativa descartada y por qué |
|---|---|---|
| Alcance de la ingesta | Comando único `pnpm corpus:sync` sobre todo el corpus | Sólo agregar skip por hash a `pnpm ingest`: deja el loop que arma títulos y particiones fuera del repo |
| Huella de invalidación | Dos columnas: `contentHash` + `pipelineVersion` | Un hash combinado: no distingue "cambió el archivo" (necesita el `.md`) de "cambió el pipeline" (no lo necesita) |
| Documentos en la base sin archivo | Se reportan, nunca se borran | Borrado automático: con la base compartida entre ocho worktrees, destruiría el trabajo de sesiones paralelas |
| Medición | Golden set de retrieval curado, con positivos y negativos | Calibración por distribución sin curaduría: mide separación estadística, no relevancia |
| `taskType` | Experimento reversible medido contra baseline | Adoptarlo como arreglo asumido: la evidencia del §2 ya no lo respalda como causa |
| Reranking | Decisión por `recall@20 − recall@5`, no construcción | Construirlo junto al resto: impide atribuir la mejora y mete una llamada de modelo en el camino crítico del TTFT |
| Ubicación del eval | `src/test/retrieval/`, fuera de `agents/` | Colgarlo de un agente: no invoca ningún agente, y mezclarlo implicaría el costo de una corrida de agentes |

---

## 4. Secuencia

Cinco piezas. El orden está determinado por qué habilita la medición de qué.

1. **Golden set de retrieval** — no depende de ningún cambio de código, y sin él las tres piezas siguientes son tuneo a ciegas.
2. **`pnpm corpus:sync`** — la ingesta incremental, y el lugar donde vive `pipelineVersion`.
3. **Umbral calibrado** — con el golden set en la mano. No requiere re-embeber, así que no depende de la pieza 4.
4. **`taskType` como experimento** — con 1 y 2 listos, cambiarlo es reversible y medible.
5. **Decisión sobre reranking** — se resuelve con una métrica, y probablemente se cierre sin construir nada.

---

## 5. Golden set de retrieval

**Ubicación**: `backend/src/test/retrieval/datasets/<categoria>.json`, fuera de `agents/`. El eval embebe la consulta, corre la query contra pgvector y mira qué volvió — no invoca ningún agente. Corre en segundos y sólo gasta llamadas de embedding.

**Item**: consulta, el filtro de partición que usaría el agente (`categoria` + `subcategorias`), y los documentos esperados **por título**. El título es único en la tabla y sobrevive a un re-chunkeo; los ids de chunk no.

**Items negativos** — la pieza que hace medible el umbral. Un item con `esperado: []` afirma que esa consulta no debería traer nada de esa partición. Tres variedades:

- **Fuera de dominio**: una consulta laboral con el filtro de arrendamiento — lo que ocurre cuando el receptor clasifica mal.
- **Absurda**: piso de la escala.
- **Dentro de la categoría, fuera del corpus**: un tema que el agente de esa categoría puede razonablemente recibir y sobre el que no hay material. Es el vector real de fabricación: el agente recibe cinco chunks a 0,68 sobre algo que no responde su pregunta y arma la respuesta con eso.

**Métricas y gate**, gateados por separado:

- **`recall@5` sobre positivos** — fracción de items donde al menos un documento esperado aparece en el top-5 (el `limit` default que usa el agente). Es el gate.
- **`recall@20` sobre positivos** — mismo cálculo con `limit: 20`. No se gatea; alimenta la decisión sobre reranking (§7).
- **Tasa de vacío correcto sobre negativos** — fracción de items negativos donde el resultado queda **estrictamente vacío** después de aplicar el umbral. Es el gate del umbral.

**Los negativos fallan todos hoy por construcción** — con `MIN_SIMILARITY = 0.3` ninguna consulta devuelve vacío jamás, así que la tasa parte de 0%. Ese es el baseline contra el que se calibra.

Los valores numéricos de ambos gates **se fijan con la primera corrida calibrada** y se registran acá; no se eligen de antemano. El `THRESHOLD = 0.9` del runner actual (`backend/src/test/run-evals.ts`) es del matcher de clasificación y no aplica a estas métricas.

**Tamaño**: ~30 positivos y ~10 negativos, proporcionales al corpus de cada categoría. Semillados desde el dataset de citación existente y los 155 títulos del corpus; revisados por el equipo — sobre todo los negativos "dentro de la categoría, fuera del corpus", que requieren saber qué se decidió no cubrir.

**Runner**: colgado del existente como `pnpm evals retrieval`.

---

## 6. `pnpm corpus:sync`

### Schema

Dos columnas nuevas en `Document`. La migración entra por Prisma desde `frontend/`, aunque el consumidor sea el backend por SQL crudo — es el reparto que ya existe.

- **`contentHash`** — sha256 del texto del archivo. Distinto ⇒ re-chunkear y re-embeber. Necesita el `.md` en disco.
- **`pipelineVersion`** — huella **derivada**, no mantenida a mano: `${modelo}|${taskType}|${chunkSize}:${overlap}`. Distinta con el mismo `contentHash` ⇒ re-embeber en el lugar desde `DocumentChunk.content`, sin tocar el archivo.

Que `pipelineVersion` sea derivada importa: cambiar `chunkSize` invalida solo, sin que nadie tenga que acordarse de bumpear un número.

La separación entre las dos columnas es lo que hace atómica la migración de `taskType` sobre una base compartida: **re-chunkear necesita el archivo, re-embeber no** — el texto ya vive en `DocumentChunk.content`. La migración recorre las 155 filas sin importar qué rama esté en disco.

### Derivación y validación del path

Codifica lo que hoy es conocimiento tribal repartido entre un loop de shell y `docs/plans/2026-07-21-ingesta-corpus-produccion.md`:

- `categoria` = primer segmento del path bajo `backend/corpus/`
- `subcategoria` = segundo segmento, con **`generales` → `NULL`** (corpus transversal a nivel categoría)
- `title` = primer `# ` del `.md`

Las tres se **validan contra el registry de dominios y la `clasificacion.ts` de la categoría**. Una subcategoría que el agente no filtra aborta la ingesta en vez de cargar documentos invisibles. Es el bug de julio (`subcategoria = "generales"` invisible al filtro) convertido en error de ejecución.

### Transaccionalidad

El orden actual de `registerDocument` —`DELETE` de los chunks, después embeber e insertar de a uno— es lo que puede dejar un documento mutilado y marcado `READY`. Se invierte:

1. Chunkear.
2. Embeber todos los chunks **fuera de transacción**, con concurrencia acotada.
3. `BEGIN; DELETE; INSERT; UPDATE Document (hash, pipelineVersion, status); COMMIT`.

Si un embedding falla, la transacción no llega a abrirse y el documento queda intacto en su versión anterior. `status` pasa a `READY` sólo con el commit.

### Modos

- **default** — incremental: salta lo que tiene hash y versión coincidentes.
- **`--dry-run`** — reporta qué haría, no toca nada.
- **`--reembed-stale`** — modo migración: recorre la base por `pipelineVersion` vieja y re-embebe desde el contenido almacenado, sin depender de los archivos.
- **`--backfill`** — de un solo uso: estampa `contentHash` y `pipelineVersion` en las 155 filas ya cargadas **sin re-embeber**, para que el primer sync incremental no vea todo el corpus como nuevo. Sólo toca filas cuya partición almacenada coincide con la que deriva el path; cualquier discrepancia se reporta y se omite.

### Reporte

Sin cambios / re-ingestados / nuevos / fallidos, más el **drift como advertencia**: documentos en la base sin archivo en disco se listan, nunca se borran.

`pnpm ingest` sobrevive para el archivo suelto, delegando en el mismo camino — misma validación, misma transacción, cero lógica duplicada.

---

## 7. Umbral, `taskType` y reranking

### Calibración del umbral

Se comparan dos distribuciones sobre el golden set: la similitud del primer documento esperado en cada positivo, y la del top-1 en cada negativo. El umbral vive entre el techo de los negativos y el piso de los positivos. Si las nubes se solapan, ningún número absoluto sirve y hay que ir a un **corte relativo al top-1** (descartar lo que quede por debajo de cierto porcentaje del mejor resultado). Se implementa el absoluto primero — es un cambio de constante — y el relativo se prueba contra él.

El criterio es **asimétrico a propósito**: maximizar los negativos que salen vacíos *sin perder recall* en los positivos. Un chunk de más lo descarta `gpt-5.6-luna` leyendo; un chunk faltante produce un "no encontré" o una respuesta armada sobre material que no venía al caso.

**Efecto de segundo orden**: cuando el umbral corte de verdad, la rama `status: "empty"` de la tool se activará por primera vez en producción. Ese camino existe y le dice al agente que no invente, pero nunca se ejerció. Necesita su propio item de eval.

### `taskType` como experimento reversible

`gemini-embedding-001` acepta `RETRIEVAL_DOCUMENT` para los chunks y `RETRIEVAL_QUERY` para la consulta; hoy `config/embedding.ts` no pasa ninguno.

Procedimiento: medir baseline con el golden set → cambiar → re-embeber → volver a medir. Se adopta si mejora, se revierte si no, y revertir es simétrico (otra corrida de `--reembed-stale`, ~150k tokens).

Para no dejar la base con dos espacios de embedding conviviendo, la corrida **embebe todo primero sin escribir y commitea los 385 chunks en una transacción**. La ventana de estado mezclado son segundos, no minutos — importa porque la base es compartida entre worktrees.

### Reranking

Se decide con **`recall@20 − recall@5`** medido *después* de calibrar el umbral:

- **≥ 10 puntos** — hay chunks buenos que existen pero quedan mal rankeados. Se justifica prototipar un reranker con `gemini-3.5-flash-lite` (ya configurado, mismo gateway) y volver a medir.
- **< 10 puntos** — el reranker no tiene nada que reordenar. Se documenta que no aplica y se cierra el tema.

Aun con brecha, la ganancia se pesa contra meter una llamada de modelo en el camino crítico del TTFT y sumar la entrada en `frontend/src/lib/board/costos.ts`.

**Predicción registrada para verificar**: con 155 documentos ya particionados por categoría y subcategoría, y un razonador leyendo los resultados, la brecha va a ser chica y el reranker no va a justificarse.

---

## 8. Errores y verificación

**Errores.** La validación del path aborta *ese* documento y sigue con el resto, pero el comando termina en exit 1 con el listado — nunca una ingesta parcial que parezca éxito. Un fallo de embedding deja el documento intacto, por la transacción. `buscar-documentos` conserva su degradación graceful (`{ status: "error", mensaje }`); esa regla no se toca.

**Verificación**, de barato a caro:

1. **Unitario, sin DB** — derivación `path → (categoría, subcategoría, título)` incluyendo `generales → NULL`; cálculo de `pipelineVersion`; matriz de decisión saltar / re-chunkear / re-embeber dada la combinación de hash y versión.
2. **`--dry-run` contra el corpus real** — debe reportar 155 sin cambios y cero acciones. Si propone tocar algo, la derivación no reproduce lo ya cargado, y eso es un bug antes de escribir nada.
3. **Golden set** como test de integración del retrieval, vía `pnpm evals retrieval`.

---

## 9. Fuera de alcance

Explícito, para que no se cuele en la implementación:

- **Borrado de documentos huérfanos** — la base es compartida entre los ocho worktrees.
- **Índice vectorial** — pgvector no soporta HNSW sobre `vector` de más de 2000 dimensiones, así que con 3072 toda búsqueda es un scan secuencial. Sobre 385 chunks no se nota. Disparador para revisitarlo: el orden de los 10k chunks, truncando a 1536 con MRL y re-normalizando.
- **Recalibración de `chunkSize`** — este trabajo la *habilita* vía `pipelineVersion` pero no la ejecuta. Dato para cuando toque: chunk mediano de 1505 caracteres contra un target de 2000, o sea que partir más fino tiene poco que ganar.
- **Búsqueda híbrida con match lexical** — es lo que haría falta para resolver bien "¿qué artículo lo respalda?". Hoy esa pregunta se resuelve por parecido semántico, que es justo lo que las reglas `conducta-*` compensan pidiéndole al agente que no complete el número de memoria.

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| El golden set queda sesgado a lo que el corpus ya cubre bien | Los negativos "dentro de la categoría, fuera del corpus" los revisa el equipo legal, que sabe qué se decidió no cubrir |
| Las distribuciones de positivos y negativos se solapan y no hay umbral absoluto viable | El corte relativo al top-1 está previsto como alternativa; ambos son cambios de pocas líneas |
| Una sesión paralela ingesta durante la migración de `taskType` | La ventana de estado mezclado es de segundos (una transacción); coordinar la corrida o repetirla al final |
| `--reembed-stale` re-embebe desde chunks producidos con un `chunkSize` viejo | `pipelineVersion` incluye `chunkSize`/`overlap`: si cambiaron, el documento requiere el archivo y el modo lo reporta como no resoluble sin `.md` |
