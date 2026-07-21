# Procesamiento — Respuestas del equipo legal a las preguntas sobre rubros laborales

**Fecha:** 2026-07-21
**Origen:** respuestas del equipo de expertos legales a
`docs/preguntas-legales/2026-07-19-rubros-laborales.md`.
**Material previo:** procesamiento inicial de los cuatro documentos de rubros laborales
en `docs/plans/2026-07-19-procesamiento-rubros-laborales.md` (corpus
`laboral/rubros-laborales`, 23 piezas; skill `dimensionar-rubros`; evals de citación).

Se recibieron respuestas a las preguntas 1, 2, 5, 6 y a la mayoría de las erratas de la
8. Las 3 y 4 se confirmaron sin cambios (ya estaban correctas). La pregunta 7
(prescripción de créditos laborales) sigue **pendiente**: no llegó material. Todo lo
procesado son **correcciones al corpus RAG** — ninguna skill ni rule cambió (el material
no trae restricciones de comportamiento nuevas; `conducta-laboral` ya exige corpus +
citación).

## Cambios aplicados por pregunta

| # | Respuesta | Pieza del corpus | Acción |
|---|---|---|---|
| 1 | El Convenio OIT 171 **sí** está ratificado, por la Ley n.º 19.582 del 28/12/2017 | `23-trabajo-nocturno-no-aptos-gravidez.md` | «(no ratificado)» → «(ratificado por Uruguay por la ley n.º 19.582 del 28 de diciembre de 2017)». Resuelve la contradicción con el corpus de despido (que ya era correcto). |
| 2 | El Convenio 132 se ratificó por **decreto-ley n.º 14.568 del 30/08/1976** | `02-licencia-derecho-generacion.md` | Mención de la p. 2 «14.588 del 30 de agosto de 1970» → «14.568 del 30 de agosto de 1976». Queda coherente con la otra mención (p. 4) del mismo documento. |
| 3 | Confirmado: **30 de noviembre** | `07-aguinaldo-concepto-calculo.md` | Ya estaba correcto (se cargó con la corrección). Confirmado; sin cambio. |
| 4 | Confirmado: **decreto** del 29 de octubre de 1957 | `12-tiempo-in-itinere.md` | Ya estaba correcto. Confirmado; sin cambio. |
| 5 | 2.º paso: **distinguir horas extras en días hábiles vs inhábiles** | `11-horas-extras-incidencia.md` | Se completó el pasaje trunco «En segundo lugar, El tercer paso…» con el segundo paso faltante. |
| 6 | Semana inglesa: **art. 26 del decreto del 29/10/1957** (cita textual) | `09-jornada-limites-excepciones.md` | Se agregó una sección «Semana inglesa» con la cita — desarrolla la tercera excepción que el documento enumeraba pero no explicaba. |
| 8 | Erratas menores | `03`, `07`, `12`, `20`, `23` | Ver abajo. |

## Detalle Q8 — erratas aplicadas y una pendiente

Aplicadas (correcciones ortográficas/gramaticales sin contenido legal, todas
confirmadas por el equipo):

- `07`: «se **fracciones**» → «se **fraccione**» (subjuntivo correcto tras «disponer que»).
- `12`: «es **tomados**» → «es **tomado**».
- `20`: «**premias** el mejor desempeño» → «**premia**»; título «**Quebrantos** de caja» →
  «**Quebranto** de caja» (aclaración adicional del equipo); «que **sea regulares y
  permanente**» → «que **sean regulares y permanentes**».
- `23`: «los **20 corridos**» → «los **20 días** corridos».
- `03`: «la cuenta **el** 1,66 entre 25» → «la cuenta **consiste en dividir** 1,66 entre 25»
  (complemento faltante).
- `03`: «**Pude** incluirse» → «**Puede** incluirse». *Sin respuesta explícita del equipo*;
  se aplicó como artefacto de digitalización inequívoco (misma clase que las anteriores,
  cero contenido legal) y se dejó señalado en el enviable por si el original dijera otra
  cosa.

**No aplicado — el número del jornalero (re-derivado al equipo).** La respuesta a la
errata del jornalero dice que 1,66 ÷ 25 «equivale a 0,0667», pero 1,66 ÷ 25 = **0,0664**
(el valor que trae el documento y que quedó en el corpus, coherente con el 0,0553 que el
mismo pasaje da para el mensual con 1,66 ÷ 30). El 0,0667 sale de usar 1,6667 (20 ÷ 12 sin
redondear). Cargar un número que no cierra con su propia división es el peor vector de
error en contenido legal (mismo criterio que la Q6 del procesamiento de despido, donde no
se aplicó un número del experto que no coincidía con la derivación del documento), así que
se mantuvo **0,0664** y se pidió una confirmación de una palabra en el enviable (¿0,0664, o
usar 1,6667 sin redondear en ambos: 0,0667 jornalero y 0,0556 mensual?).

## Cruce con el corpus de despido (Q1)

La contradicción de la Q1 era entre `TRABAJO NOCTURNO` («no ratificado») y el corpus de
despido `15-despido-trabajo-nocturno.md` («ratificó en el año 2017»). La respuesta
confirma que el de despido era el correcto. Se corrigió solo la pieza equivocada
(rubros-laborales 23); la de despido se cruzó y quedó sin cambios (fiel a su fuente y ya
consistente con la Ley 19.582/2017).

## Evals

- **Laboral citación** (`citacion.json`, 8 → 9 items): item nuevo de **semana inglesa**
  (consulta sustantiva ahora respondible desde el corpus por el desarrollo agregado en la
  Q6) — debe disparar `buscar-documentos`. Es la cobertura del golden set para el único
  contenido genuinamente nuevo del lote. El resto de las respuestas son correcciones de
  texto que no cambian el ruteo de tool-calls, por lo que no mueven el matcher programático
  (esperado); su verificación de contenido es el smoke-test de retrieval.

## Verificación

- `pnpm test` (backend): **52/52**.
- `pnpm lint` (backend): limpio.
- **Re-ingesta** de las 8 piezas corregidas (02, 03, 07, 09, 11, 12, 20, 23): todas
  `READY` (idempotente por `title` — mismo `documentId` actualizado con el texto corregido
  re-embebido). Corpus rubros-laborales: **23 documentos** (sin duplicados), 54 chunks.
- **Smoke test de retrieval** (pipeline real de `buscar-documentos`, filtro
  `laboral`/`rubros-laborales`): 4 consultas representativas recuperan la pieza correcta
  como top result con el texto corregido/nuevo presente — semana inglesa (sim 0,76),
  Convenio 171 ratificado (0,76), segundo paso hábiles/inhábiles (0,81), Convenio 132
  ratificado (0,79).
- `pnpm evals`: receptor clasificación **19/19** (100%) y laboral citación **9/9** (100%,
  incluye el item nuevo de semana inglesa). Ambos gates sobre el umbral de 90%.

## Segunda vuelta de respuestas (2026-07-21) — dos confirmaciones de una palabra

El equipo legal confirmó los dos puntos que quedaban abiertos en la Q8, ambos
validando lo que ya estaba en el corpus (sin cambios de contenido ni re-ingesta):

- **Factor diario del jornalero**: «Dejemos 0,0664». El corpus mantiene **0,0664**
  (1,66 ÷ 25, coherente con el 0,0553 del mensual). Confirmado; sin cambio.
- **«Pude/Puede»**: «La respuesta correcta es "Puede"». El corpus ya decía **«Puede»**.
  Confirmado; sin cambio.

Como no cambió corpus ni código, la verificación previa (test 52/52, lint, evals 19/19
+ 9/9, 23 docs `READY`) sigue vigente.

## Pendiente (no bloqueante)

- **Pregunta 7 — prescripción de créditos laborales**: único punto abierto. Sin
  material. El asistente no afirma plazos (releva la fecha de egreso y es honesto si el
  corpus no lo trae). Reiterado el pedido en el enviable.
