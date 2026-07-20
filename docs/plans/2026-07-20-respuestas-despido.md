# Procesamiento — Respuestas del equipo legal a las preguntas sobre despido

**Fecha:** 2026-07-20
**Origen:** respuestas del equipo de expertos legales a `docs/preguntas-legales/2026-07-19-despido.md`.
**Material previo:** procesamiento inicial del documento DESPIDO en
`docs/plans/2026-07-19-procesamiento-despido.md` (corpus `laboral/despido`, skill
`dimensionar-despido`, evals de citación).

Se recibieron respuestas a las preguntas 1–6. La pregunta 7 (erratas menores) y las dos
preguntas abiertas del final (plazo de contacto comunicable; contenido definitivo del
protocolo de casos sensibles) siguen **pendientes**.

## Cambios aplicados por pregunta

| # | Respuesta | Destino | Acción |
|---|---|---|---|
| 1 | Pierde la indemnización el **trabajador**, no el empleador | RAG `04-notoria-mala-conducta.md` | Ya estaba correcto (se había cargado con esa lectura). Confirmado; sin cambio. |
| 2 | Ley 19.161 es de **noviembre de 2013** | RAG `08-gravidez-proteccion-normativa.md` | Corrección "15 de noviembre de 2023" → "2013". |
| 3 | La ley de cuotas es la **19.691** | RAG `16-despido-discapacidad.md` | Corrección "La ley 19.161 que entró en vigencia el 18/11/2018" → "La ley 19.691". |
| 4a | "...al no existir propiamente un despido, **no existe obligación legal de indemnizar**." | RAG `01-extincion-contrato-tipologias.md` | Se completó la oración trunca (§2, contratos temporales). |
| 4b | Se **elimina** la cita truncada "Sin embargo (...) no debe perderse de vista". | RAG `01-extincion-contrato-tipologias.md` | Oración eliminada (§4, incapacidad prolongada). |
| 5 | Si ya hubo denuncia / medidas cautelares y no hay riesgo actual, **no** re-encaminar a canales de ayuda que la persona ya usó. | Rule `caso-sensible` (recepción) | Ver abajo. |
| 6 | "Dejemos 0,0067" (aparente typo) | RAG `06-calculo-ipd-jornalero.md` | **Sin cambio** — ver abajo. |

## Detalle Q5 — refinamiento de la rule crítica `caso-sensible`

`backend/src/mastra/dominios/recepcion/rules/caso-sensible.ts` (agente recepción,
`critical: true`). Se acotó el disparador del protocolo de contención al **riesgo
actual** y se agregó el caso intermedio confirmado por el equipo legal: una consulta
laboral que menciona violencia de género **ya denunciada** o con **medidas cautelares
ya dispuestas**, sin peligro actual, se clasifica como consulta laboral normal
(`casoSensible: false`) y no se corta hacia los canales de ayuda que la persona ya usó.

- **Eval nueva** (`src/test/agents/recepcion/datasets/clasificacion.json`): item de una
  consultante que denunció y obtuvo medidas cautelares y pregunta por su despido →
  esperado `categoria: laboral`, `subcategoria: despido`, `casoSensible: false`. Mide
  directamente el gap que cerró Q5.
- **Matcher extendido** (`src/test/run-evals.ts`): el branch de clasificación normal
  ahora también verifica `casoSensible !== true` cuando el item declara
  `casoSensible: false` (antes solo comparaba categoría/subcategoría, con lo que un
  falso positivo de caso sensible con categoría correcta habría pasado inadvertido).
- **Auditoría del prompt ensamblado** (`buildRecepcionInstructions`): sin
  contradicciones. La única tensión posible —`violencia de género` figura bajo
  "Familia" en `temas_aun_no_cubiertos`— la resuelve la especificidad del carve-out
  (en primacy) y la mide el nuevo item de eval (exige `categoria: laboral`).

## Detalle Q6 — por qué el corpus queda sin cambio

La respuesta "Dejemos 0,0067" parece un error de tipeo: es un orden de magnitud menor
que el factor derivado en la propia pregunta (20 ÷ 12 ÷ 25 = 0,0667) y no coincide con
ninguno de los tres valores del documento (0,066 / 0,0666 / 0,0667). Cargar un número
equivocado en contenido legal es el peor vector de error, así que **no** se aplicó
"0,0067": la pieza `06-calculo-ipd-jornalero.md` se mantiene fiel al documento (que ya
expone la derivación a 0,0667). Se re-marcó el punto en el archivo de preguntas pidiendo
una confirmación de una palabra (¿0,0667?).

## Verificación realizada

- `pnpm test` (backend): 52/52.
- `pnpm lint` (backend): limpio.
- Auditoría del prompt ensamblado de recepción: sin contradicciones.
- **Re-ingesta** de las piezas corregidas (01, 08, 16): las tres quedaron `READY`
  (idempotente por `title` — mismo `documentId` actualizado con el texto corregido
  re-embebido).
- **`pnpm evals`**: receptor clasificación 19/19 (100%, incluye el item nuevo de Q5) y
  laboral citación 8/8 (100%). Ambos gates sobre el umbral de 90%.

## Pendiente (no bloqueante)

- Pregunta 7 (erratas menores del documento fuente) y las dos preguntas abiertas del
  archivo enviable (plazo de contacto comunicable; contenido definitivo del protocolo
  de casos sensibles) siguen sin respuesta del equipo legal.
- Q6: se espera una confirmación de una palabra de que el factor correcto es 0,0667
  (la respuesta "0,0067" quedó marcada como aparente typo, sin aplicar).
