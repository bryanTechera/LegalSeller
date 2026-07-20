# Procesamiento de los documentos de RUBROS LABORALES (equipo legal) — 2026-07-19

Segundo lote de material del equipo de expertos legales, procesado con la skill
`procesar-documento-legal` (`.claude/skills/`). Fuentes en `docs/laboral/`:

| Documento | Páginas |
|---|---|
| `JORNADA DE TRABAJO + HORAS EXTRAS + DESCANSO SEMANAL TRABAJADO + DESCANSO INTERMEDIO + TIEMPO IN ITINERE.pdf` | 6 |
| `DESCANSO SEMANAL + LICENCIA + SALARIO VACACIONAL + AGUINALDO.pdf` | 14 |
| `SALARIO O REMUNERACIÓN -EN DINERO Y EN ESPECIE-.pdf` | 8 |
| `TRABAJO NOCTURNO.pdf` | 4 |

En el mismo lote llegó `PARA_IMPRIMIR_DONIA.pdf`: **no es material legal** (talón de
pago personal de un certificado de antecedentes judiciales) — descartado del
procesamiento, no ingerido y no commiteado; queda avisado el equipo técnico para
retirarlo de la carpeta. `docs/despido/DESPIDO.pdf` fue movido por el equipo a
`docs/laboral/despido/DESPIDO.pdf` (mismo hash, solo reorganización).

## Decisión estructural: subcategoría `rubros-laborales` habilitada

Los cuatro documentos cubren en conjunto la subcategoría **Rubros laborales** de la
taxonomía (`docs/dominio-consultas.md`): salario y diferencias, horas extras,
licencia, salario vacacional, aguinaldo, feriados y descansos, nocturnidad.
Habilitación según el patrón del registry (spec §5: habilitar = flag + carpeta):

- `dominios/laboral/clasificacion.ts`: `rubros-laborales.habilitada: true` +
  descripción enriquecida. De ahí derivan automáticamente la static skill
  `subcategorias-laboral`, los enums de `asignar-clasificacion` / `registrar-caso`
  y el payload de `GET /dominios`. Sin subagente nuevo (nivel 2 colapsado).
- Tests que codificaban el estado "v1: solo despido" actualizados:
  `registry.test.ts`, `api-dominios.test.ts`, `skills/index.test.ts`
  (`subcategoriaUnicaHabilitada("laboral")` ahora es `null` — dos habilitadas).

## Piezas y destinos

### RAG (23 piezas → 23 documentos, categoria `laboral`, subcategoria `rubros-laborales`)

Curadas en `backend/corpus/laboral/rubros-laborales/*.md` (re-ingestables con
`pnpm ingest`, idempotente por título). 52 chunks en pgvector, todos `READY`.

| # | Pieza | Fuente |
|---|---|---|
| 01 | Descanso semanal trabajado y feriados: remuneración | DESCANSO… pp. 1-2 |
| 02 | Licencia anual: derecho, generación y trabajo computable | DESCANSO… pp. 2-4 |
| 03 | Licencia anual: duración, antigüedad, goce y fraccionamiento | DESCANSO… pp. 4-6 |
| 04 | Licencia anual: remuneración y jornal de vacaciones | DESCANSO… pp. 6-9 |
| 05 | Licencia anual: enajenación, egreso, aportes y licencia no gozada | DESCANSO… pp. 9-10 |
| 06 | Salario vacacional | DESCANSO… pp. 10-11 |
| 07 | Aguinaldo: concepto, cálculo y beneficiarios | DESCANSO… pp. 11-12 |
| 08 | Aguinaldo: partidas computables, pago y egreso | DESCANSO… pp. 12-14 |
| 09 | Jornada de trabajo: límites y excepciones | JORNADA… pp. 1, 4 |
| 10 | Horas extras: régimen y recargos | JORNADA… pp. 1-3 |
| 11 | Incidencia de las horas extras en licencia, salario vacacional, aguinaldo e indemnización | JORNADA… pp. 3-4 |
| 12 | Tiempo in itinere | JORNADA… pp. 4-5 |
| 13 | Descansos intermedios | JORNADA… pp. 5-6 |
| 14 | Concepto de remuneración y remuneraciones por mandato legal | SALARIO… p. 1 |
| 15 | Remuneración en dinero y en especie: criterios de calificación | SALARIO… pp. 1-2 |
| 16 | Percepciones no remunerativas | SALARIO… pp. 2-3 |
| 17 | Sistemas de remuneración: por tiempo y por resultados | SALARIO… pp. 3-5 |
| 18 | Concepto, naturaleza y morfología del salario | SALARIO… pp. 5-6 |
| 19 | Prestaciones en especie: vivienda, alimentación, vestimenta y transporte | SALARIO… pp. 6-7 |
| 20 | Prestaciones en dinero: viáticos, propinas, comisiones, gratificaciones y primas | SALARIO… pp. 7-8 |
| 21 | Diferencia de salario: cálculo del reclamo | SALARIO… p. 8 |
| 22 | Trabajo nocturno: concepto y sobretasa | NOCTURNO pp. 1, 3-4 |
| 23 | Trabajo nocturno: trabajadores no aptos y trabajadora grávida | NOCTURNO pp. 1-3 |

**Curación**: contenido verbatim; extracción de texto con pypdf (sin render de
páginas). Fidelidad verificada con diff de multiset numérico fuente↔curado y
sentinelas de primera oración por pieza (23/23). Diferencias, todas explicadas:

- Encabezados de corrida del libro fuente removidos: «107 Patricia Rosenbaum»
  (DESCANSO… p. 8, en medio de la oración de horas extras) y «182 El salario»
  (SALARIO… p. 5).
- Marcadores de nota al pie removidos: «aquel28» (SALARIO… p. 3),
  «parcial3» (DESCANSO… p. 13).
- Dos oraciones duplicadas consecutivas colapsadas en la pieza 17 («De otro lado,
  la comisión puede constituir… el importe de las comisiones» aparecía dentro de
  b) Comisión —su lugar— y repetida dentro de c) Rendimiento, artefacto de corte
  de página 4→5; versión de b) conservada).
- Encabezado «1. Concepto y naturaleza del salario / 1.1. Concepto» fusionado en
  «1. Concepto» (pieza 18; solo estructura de títulos, texto intacto).

### Reparaciones de transcripción (pendientes de confirmación del equipo legal)

1. **«31 de noviembre» → «30 de noviembre»** (pieza 07, cálculo del aguinaldo):
   fecha inexistente; la p. 11 del mismo documento define el período correctamente
   («30 de noviembre») citando la ley 12.840 — pregunta 3 del enviable.
2. **«El artículo 29 de octubre de 1.957» → «El decreto de 29 de octubre de
   1957»** (pieza 12, in itinere): el propio documento llama «decreto del 29 de
   octubre de 1957» a esa norma en las demás menciones — pregunta 4 del enviable.

### Contradicciones detectadas (NO resueltas — derivadas al equipo legal)

- **Convenio OIT 171**: `TRABAJO NOCTURNO.pdf` dice «(no ratificado)»; el corpus
  de despido (pieza 15, del documento DESPIDO del mismo equipo) dice «ratificó en
  el año 2017». Ambas versiones quedan tal cual en el corpus hasta la respuesta —
  pregunta 1 del enviable.
- **Ratificación del Convenio 132**: el documento DESCANSO… se contradice
  internamente (p. 2: decreto-ley 14.588 del 30/8/1970; p. 4: decreto-ley 14.568
  de 30/8/1976). Ambas mantenidas verbatim — pregunta 2 del enviable.

### Erratas menores mantenidas tal cual

«Pude incluirse» (p. 6), «la cuenta el 1,66 entre 25» (p. 5), «se fracciones en
dos etapas» (p. 12) en DESCANSO…; «es tomados en consideración» (p. 5) en
JORNADA…; «premias el mejor desempeño» (p. 7), «que sea regulares y permanente»
(p. 8) en SALARIO…; «transcurre los 20 corridos» (p. 2) en NOCTURNO — pregunta 8
del enviable.

### Skill (1 nueva)

- `dimensionar-rubros` (static, solo `laboral`, tag `<dimensionar_rubros>`):
  heurísticas de práctica — datos para dimensionar (forma de remuneración y
  partidas, jornada real, recibo vs pago real, vigencia/egreso del vínculo),
  arrastre entre rubros (horas extras inciden en licencia/vacacional/aguinaldo/
  IPD), errores comunes del consultante y señales de dimensionamiento
  (nocturnidad, in itinere, descansos intermedios, categorías excluidas de
  límite de jornada). Sin citas normativas embebidas (litmus de la taxonomía).
  Registrada al final del bloque de conocimiento, después de
  `dimensionar-despido` y antes de `<captacion>` (recencia intacta).
  Test de activación en `static-skills/dimensionar-rubros.test.ts`.

### Rules

Ninguna nueva ni modificada: `conducta-laboral` ya exige corpus + citación y el
material no trae restricciones de comportamiento nuevas. Auditoría del prompt
ensamblado (`buildLaboralInstructions`): orden primacy→recencia intacto, sin
contradicciones `<dimensionar_despido>`↔`<dimensionar_rubros>` (renuncia sin IPD
vs renuncia que conserva licencia/aguinaldo son complementarios), sin colisiones
tag↔tool.

## Gap de alcance detectado

**Prescripción de créditos laborales**: ningún documento del lote trata los
plazos para reclamar (dato crítico en conversaciones de rubros impagos). La skill
releva la fecha de egreso sin afirmar plazos; si el corpus no lo trae, el agente
lo dice honesto y capta igual (regla vigente de `conducta-laboral`). Material
solicitado al equipo legal — pregunta 7 del enviable.

## Preguntas abiertas al equipo legal

> **Archivo enviable**: `docs/preguntas-legales/2026-07-19-rubros-laborales.md` —
> redactado para los abogados, listo para enviar tal cual. Este registro solo lo
> referencia.

## Evals agregadas (el gap que vino a cerrar el lote)

- **Receptor** (`clasificacion.json`, 15 → 18 items): item de sueldos impagos
  reforzado (ahora exige subcategoria `rubros-laborales`) + 3 relatos nuevos —
  horas extras nunca pagadas, renuncia con licencia/aguinaldo impagos
  (discriminador renuncia ≠ despido), nocturnidad sin plus.
- **Laboral citación** (`citacion.json`, 4 → 8 items): feriado trabajado, horas
  extras, aguinaldo con comisiones y nocturnidad deben disparar
  `buscar-documentos` antes de responder.

## Verificación

- `pnpm test`: 52/52 · `pnpm lint`: limpio.
- `pnpm evals`: receptor 18/18 (100%), laboral citación 8/8 (100%).
- Smoke test de retrieval: 6 consultas representativas recuperan la pieza
  correcta con similitud 0.73–0.80 (filtro `despido` + `rubros-laborales`).
- Corpus en DB: 19 `despido` + 23 `rubros-laborales`, todos `READY`.
