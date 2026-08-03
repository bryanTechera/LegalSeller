# Procesamiento: profundidad de familia — sucesiones, sociedad conyugal, donaciones matrimoniales, tutela y curatela (2026-08-03)

Registro del procesamiento (skill `procesar-documento-legal`) de los **cinco extractos
del Código Civil** que el equipo legal envió el 2026-08-03 (`docs/familia/*.docx`).
Este envío responde la **pregunta 4** del archivo enviable
`docs/preguntas-legales/2026-07-22-familia.md` ("sucesiones y capacidad/curatela en
profundidad"): la selección de artículos que en julio no quisimos hacer por cuenta
propia ahora la hizo el experto.

Fuentes (leídas completas):

| Documento | Contenido |
|---|---|
| CÓDIGO CIVIL SUCESIÓN -DESHEDERACIÓN -PARTICIÓN | Arts. 776-1187 (Títulos IV-VI del Libro Tercero, con reformas 17.703, 19.075, 19.889, 20.021) |
| CÓDIGO CIVIL -SOCIEDAD CONYUGAL | Arts. 1938-2017 (Título VII, con reformas 19.075/19.119 y 20.443 al art. 1946) |
| CODIGO CIVIL -DONACIONES RELACIONADAS AL MATRIMONIO | Arts. 1644-1660 |
| CODIGO CIVIL - DE LA TUTELA | Arts. 313-430 (Título X) |
| CODIGO CIVIL - CURATELA (INCAPACIDAD) | Arts. 431-459 (Título XI, con redacción 17.535 al art. 432) |

## Triage por pieza

Los cinco documentos son **texto normativo puro** (transcripciones limpias del Código
Civil consolidado, sin comentarios del experto): todo lo aprovechable va al **RAG**.
No traen criterios de práctica (skill) ni restricciones de comportamiento (rule) —
los criterios prácticos equivalentes a los de la síntesis quedaron pedidos (pregunta 2
del enviable nuevo).

| Pieza | Destino |
|---|---|
| Texto de los artículos, con sus condiciones e hipótesis, y las notas de vigencia relevantes ("redacción dada por Ley…") | **RAG** — 19 archivos temáticos curados (patrón de corpus del proyecto; no se ingieren los extractos crudos) |
| Notas "(*) Ver en esta norma, artículos: …" (referencias cruzadas IMPO) | **Descarte** — ruido de retrieval, sin contenido legal |
| Stubs de artículos derogados (1960, 1977, 1988, 1990, 1997, 2001, 2005, 2007, 332, 383, 865, 1022, 1029, 1054, 1112, 1118…) | **Descarte** — sin valor para orientar una consulta |
| Encabezados IMPO repetidos ("TITULO VII … Ajustado a los artículos…") | **Descarte** — ruido |

## Mapeo contra lo existente

- `sucesiones/01-sucesion-mapa.md` — SE CONSERVA (mapa del proceso + relevamiento para
  captación); los archivos nuevos agregan la profundidad normativa que le faltaba.
- `generales/09-capacidad-interdiccion-curatela.md` — SE CONSERVA (marco de la
  Convención/Ley 18.418 y criterios de orientación); el archivo nuevo de curatela cubre
  el trámite y los efectos, y repite el anclaje al enfoque de apoyos en una línea.
- `divorcio-sociedad-conyugal/04-sociedad-conyugal-disolucion-liquidacion.md` — SE
  CONSERVA (disolución a pedido, art. 1985/1986, y advertencia "mitad de todo"); los
  archivos nuevos desarrollan justamente la distinción propios/gananciales que el 04
  anuncia, sin repetir el art. 1985.
- Rules/skills de familia — SIN CAMBIOS: `conducta-familia` y `dimensionar-familia` no
  hardcodean limitaciones de corpus, y `subcategorias-familia` es registry-driven. El
  material no trae criterios de práctica que justifiquen tocar skills.
- Sin colisión con el procesamiento del Q&A del Código Civil del mismo día
  (`2026-08-03-procesamiento-preguntas-codigo-civil.md`): aquel tocó adulterio,
  filiación (art. 220) y compraventa entre cónyuges (art. 1675); este lote no toca esos
  temas y las donaciones entre cónyuges (art. 1657, nulidad) son consistentes con la
  sección de compraventa (art. 1675, nulidad) del archivo 04.

## Decisiones arquitectónicas

1. **Corpus curado temático, no ingesta cruda**: mismo patrón de julio — archivos por
   tema de consulta, texto del artículo integrado con sus condiciones, cita "(Código
   Civil, art. N)" y nota de reforma cuando aporta ("redacción de la Ley 19.075").
2. **Subcategorías**: sucesiones recibe 11 archivos; divorcio-sociedad-conyugal 5
   (sociedad conyugal profunda + donaciones matrimoniales); tutela y curatela quedan
   **transversales** (`subcategoria = NULL`, 3 archivos) — la taxonomía no cambia, no
   se inventan subcategorías (pregunta 3 del enviable nuevo re-plantea la etiqueta).
3. **Literalidad del Código**: el texto enviado conserva redacciones originales
   (art. 441 "marido/mujer"; art. 831 impúberes 14/12; distinción legítimos/naturales).
   Se transcriben como están — la adecuación terminológica es decisión del equipo
   legal (pregunta 1 del enviable nuevo), no nuestra.
4. **Sin cambios de registry, agentes ni prompts** — el gap era exclusivamente de
   corpus + evals.

## Archivos de corpus (19 nuevos)

- `sucesiones/` (subcategoria `sucesiones`): 02-testamento-formas-capacidad ·
  03-herederos-legados-albaceas · 04-incapacidad-indignidad-heredar ·
  05-legitimas-asignaciones-forzosas · 06-porcion-conyugal-derecho-habitacion ·
  07-desheredacion · 08-sucesion-intestada-orden · 09-apertura-aceptacion-repudiacion ·
  10-beneficio-inventario · 11-colacion-particion · 12-deudas-herencia.
- `divorcio-sociedad-conyugal/`: 05-capitulaciones-matrimoniales ·
  06-bienes-propios-gananciales · 07-sociedad-conyugal-administracion-deudas ·
  08-liquidacion-division-gananciales · 09-donaciones-por-causa-de-matrimonio.
- `generales/` (transversal, `subcategoria = NULL`): 11-tutela-menores-designacion ·
  12-tutela-ejercicio-administracion · 13-curatela-tramite-interdiccion.

## Evals

Cada eval nueva mide el gap que este material vino a cerrar (corpus nuevo → citación y
fidelidad):

- Familia `citacion.json`: **+6 ítems** (herencia intestada, desheredación, derecho de
  habitación del cónyuge, curatela por demencia, herencia con deudas, tutela de
  sobrinos) — el agente debe fundar en `buscar-documentos`.
- Familia `fidelidad.json`: **+7 ítems** anclados a hechos del corpus nuevo — legítima
  con un solo hijo ("mitad", art. 887), desheredación de menor de 18 (art. 897),
  repudiación por escritura pública (art. 1075), plazo de noventa días del beneficio de
  inventario (art. 1081), acción de reforma en cuatro años (art. 1006), nulidad de la
  donación entre cónyuges (art. 1657), tres testigos del testamento abierto (art. 793).
- Resultados: ver sección final.

## Docs y preguntas

- `docs/dominio-consultas.md`: fila Sucesiones (corpus profundo 2026-08-03) y nota de
  temas transversales (+ tutela, + trámite de interdicción).
- `docs/preguntas-legales/2026-07-22-familia.md`: pregunta 4 → respondida (nota con el
  detalle del material recibido); estado general → PARCIALMENTE RESPONDIDA (1, 2, 3, 5
  y 6 siguen pendientes — en particular el CGP del proceso sucesorio, pregunta 3).
- **Enviable nuevo**: `docs/preguntas-legales/2026-08-03-familia-sucesiones-tutela-curatela.md`
  (PENDIENTE): (1) literalidad vs. adecuación terminológica (arts. 441, 831,
  legítimos/naturales) con matrimonio igualitario; (2) criterios prácticos de atención
  para sucesiones/tutela/curatela; (3) etiqueta propia para tutela y
  curatela/interdicción en la derivación.

## Resultados de la verificación

- `pnpm test` 96/96 · `pnpm lint` limpio.
- `pnpm evals familia` (primera corrida, sin calibración posterior): **citación 16/16
  (100%)** · **voz-fuentes 4/4 (100%)** · **captación 2/2 (100%)** · **fidelidad 14/14
  (100%)** — threshold 90%. El receptor no se corrió: este lote no toca prompts,
  registry ni el golden set de clasificación (el corpus es invisible para el receptor).
- Ingesta a la base de Railway (mismo flujo de `2026-07-21-ingesta-corpus-produccion.md`,
  `pnpm ingest` idempotente por título): **19 documentos nuevos, todos `READY`, 57
  chunks, 0 huérfanos**. Familia pasa de 24 a 43 documentos: sucesiones 1 → 12 ·
  divorcio-sociedad-conyugal 4 → 9 · transversal (`NULL`) 10 → 13.
- El archivo 03 (herederos/legados/albaceas) se re-ingestó tras una corrección de
  literalidad detectada en la auditoría final: el art. 953 dice "una mujer" (no "una
  persona") — coherente con la pregunta 1 del enviable nuevo, que deja la adecuación
  terminológica en manos del equipo legal.
