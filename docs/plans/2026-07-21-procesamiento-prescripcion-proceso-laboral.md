# Procesamiento — Prescripción (Ley 18.091) y proceso laboral (Ley 18.572) — 2026-07-21

Tercer lote de material del equipo de expertos legales, procesado con la skill
`procesar-documento-legal`. Fuentes en `docs/laboral/`:

| Documento | Páginas |
|---|---|
| `Ley N° 18091.pdf` — Prescripción de acciones y créditos laborales | 2 |
| `Ley N° 18572 -LEY DE PROCESO LABORAL-.pdf` — Abreviación de los juicios laborales | 15 |

Este material **cierra la pregunta 7** que había quedado pendiente en el lote de rubros
laborales (`docs/preguntas-legales/2026-07-19-rubros-laborales.md` §7): plazos para
reclamar (prescripción/caducidad). Extracción de texto con pypdf (sin render de páginas,
mismo método que los lotes anteriores).

## Decisión estructural: corpus transversal (nivel categoría, `subcategoria = NULL`)

Ambas leyes **aplican a toda la categoría laboral** —tanto a despido como a rubros—: la
prescripción rige cualquier reclamo, y el proceso laboral es el mismo para todos los
rubros. No son de una subcategoría.

El modelo de datos tenía una sola `subcategoria` por `Document` (y título único: una ley
no puede duplicarse bajo dos subcategorías), y el agente laboral filtra el retrieval por
sus subcategorías (`["despido", "rubros-laborales"]`). Un documento con
`subcategoria = NULL` quedaba **invisible**, porque `NULL` nunca satisface
`subcategoria = ANY($filtro)`.

**Cambio** (decisión técnica, no ambigüedad legal): se introduce el concepto de **corpus
a nivel categoría** = `subcategoria NULL`, y el retrieval lo mantiene **siempre en
alcance** cuando hay filtro de subcategorías:

```sql
-- backend/src/mastra/tools/documentos/buscar-documentos-tool.ts (buildSearchQuery)
(d."subcategoria" = ANY($n) OR d."subcategoria" IS NULL)
```

- Los 43 documentos existentes (todos con subcategoría no nula) no se ven afectados.
- Sin filtro de subcategorías el comportamiento no cambia (ya incluía los NULL).
- Test nuevo en `buscar-documentos-tool.test.ts` ("incluye también el corpus transversal
  (subcategoria NULL)"); el test previo sigue verde (el substring `= ANY($5)` se conserva).

Sin skill ni rule nueva: `conducta-laboral` ya obliga a buscar en el corpus antes de
responder una consulta sustantiva, y las skills `dimensionar-despido` / `dimensionar-rubros`
ya relevan la fecha de egreso (el gancho práctico para la prescripción). El agente
recupera y cita estas piezas por el mecanismo vigente. Auditoría del prompt ensamblado
(`buildLaboralInstructions`): sin contradicciones nuevas, sin colisiones tag↔tool.

## Piezas y destinos

### RAG (4 piezas → 4 documentos, categoria `laboral`, `subcategoria = NULL`)

Curadas en `backend/corpus/laboral/generales/*.md` (re-ingestables con `pnpm ingest`,
idempotentes por título). Contenido normativo **verbatim**; se removieron solo los
artefactos de la publicación de IMPO (encabezados de página, `(*)Notas`, navegación
"Referencias/Ver en esta norma"). Se usó el articulado vigente (redacciones dadas por la
Ley 18.847 donde correspondía). Fidelidad numérica verificada pieza por pieza (multiset de
números fuente↔curado).

| Pieza | Contenido | Fuente |
|---|---|---|
| `01-prescripcion-acciones-creditos` | Prescripción: acciones (1 año del cese), créditos (5 años desde exigibles), interrupción por MTSS y por demanda, alcance a relaciones vigentes | Ley 18.091, arts. 1-5 |
| `02-gratuidad-principios-proceso` | Principios del proceso laboral; gratuidad total para la parte trabajadora | Ley 18.572, arts. 1 y 28 |
| `03-conciliacion-previa-mtss` | Conciliación previa obligatoria ante el MTSS antes del juicio; constancia a los 30 días | Ley 18.572, arts. 3 y 6 |
| `04-actualizacion-intereses-recargo` | Actualización monetaria + interés legal 6% anual; recargo automático 10% por mora | Ley 18.572, arts. 16 y 29 |

La pieza de prescripción lleva una intro en lenguaje natural ("hasta cuándo se puede
reclamar", "cuánto tiempo hacia atrás", "si ya pasó tiempo desde que terminó el vínculo")
para que el retrieval la recupere ante la pregunta canónica del consultante, que rara vez
usa la palabra "prescripción".

### Descartes documentados (Ley 18.572 — mecánica procesal)

No aportan a la orientación de una persona que consulta ni al funnel de captación; se
omiten del corpus (decisión documentada, no omisión silenciosa):

- Competencia (art. 2); acta y domicilio de la audiencia de conciliación (arts. 4-5).
- Proceso ordinario: demanda, traslado, excepciones, audiencia única, sentencia
  (arts. 7-15).
- Apelación, segunda instancia y régimen de recursos, incluida casación (arts. 17-18).
- Proceso de menor cuantía y su trámite (arts. 19-23) — además su monto tope es un valor
  que la SCJ actualiza anualmente (dato que envejece; no se carga).
- Representación judicial (art. 24); notificaciones (art. 25); cómputo de plazos
  (art. 26); ejecución de sentencia (art. 27); interpretación e integración (arts. 30-31);
  disposición transitoria (art. 32).
- Ley 18.091, art. 6 (derogación del art. 29 de la Ley 16.906): housekeeping legislativo
  sin valor de orientación.

## Ambigüedad legal → derivada al equipo (no asumida)

El material se cargó con los plazos tal como vienen (1 año / 5 años). Por ser un dato de
alto impacto (define si una persona está o no en plazo), quedan dos **confirmaciones** en
el enviable nuevo `docs/preguntas-legales/2026-07-21-prescripcion-proceso-laboral.md`:
(1) vigencia de los plazos de la Ley 18.091; (2) validez del encuadre práctico con el que
el asistente combina el año del art. 1 y los cinco años del art. 2. Ninguna bloquea el uso
del material.

## Evals agregadas (el gap que vino a cerrar el lote)

- **Laboral citación** (`citacion.json`, 9 → 12 items): tres relatos que deben disparar
  `buscar-documentos` antes de responder — prescripción con marco de despido ("me
  despidieron hace casi dos años, ¿ya prescribió?"), prescripción de créditos con marco de
  rubros ("hasta cuánto tiempo hacia atrás puedo reclamar sueldos/horas extras impagas"),
  y costo del reclamo para el trabajador (gratuidad).

## Verificación

- `pnpm test`: 53/53 (16 archivos; +1 test del corpus transversal). `pnpm lint`: limpio.
- `pnpm evals`: receptor clasificación **19/19** (100%) y laboral citación **12/12**
  (100%, incluye los tres items nuevos de prescripción/gratuidad). Ambos gates sobre el
  umbral de 90%.
- Smoke test de retrieval (pipeline real de `buscar-documentos`, filtro real del agente
  `laboral` + `["despido","rubros-laborales"]`): las 4 piezas transversales se recuperan
  pese al filtro de subcategorías (valida el fix end-to-end). Top result correcto en
  gratuidad (0,71), conciliación previa (0,78), intereses/recargo (0,77); prescripción
  entra en el top 5 tanto con marco de despido (0,72) como de rubros (0,71).
- Corpus en DB: 19 `despido` + 24 `rubros-laborales` + **4 transversales (NULL)**, todos
  `READY`.
