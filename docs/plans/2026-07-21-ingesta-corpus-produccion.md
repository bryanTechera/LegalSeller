# Ingesta del corpus legal a producción (Railway) — 2026-07-21

Registro operativo de la **ingesta** del corpus ya curado (`backend/corpus/`) a la base
de datos de producción en Railway (servicio `pgvector`). No es un procesamiento de
material nuevo: el triage por pieza ya se hizo en los lotes previos
(`2026-07-19-procesamiento-despido.md`, `2026-07-19-procesamiento-rubros-laborales.md`,
`2026-07-21-procesamiento-prescripcion-proceso-laboral.md`). Acá se documenta **qué
quedó cargado y qué no**, para tener control del estado del RAG en prod.

## Resumen

- **46 documentos** ingestados, todos `status = READY`, **143 chunks**, 0 huérfanos.
- Extensiones `vector` + `pgcrypto` presentes (creadas por la migración `init`).
- Categoría `laboral` únicamente. Distribución: transversal (NULL) 4 · despido 19 · rubros-laborales 23.
- Verificado E2E contra el chat de producción: una consulta de prescripción disparó
  `buscar-documentos` y el agente citó Ley 18.091 arts. 1-3 desde el corpus.

## Corrección aplicada: `generales/` → `subcategoria = NULL` (transversal)

Los 4 archivos de `backend/corpus/laboral/generales/` (prescripción y proceso laboral)
son **corpus transversal a nivel categoría**: aplican a todo reclamo laboral, no a una
subcategoría (decisión de `2026-07-21-procesamiento-prescripcion-proceso-laboral.md`).
El retrieval los mantiene en alcance con `(d."subcategoria" = ANY($n) OR d."subcategoria" IS NULL)`.

La ingesta batch, que infería la subcategoría del nombre de la carpeta, los cargó primero
como `subcategoria = "generales"` — valor que **no** matchea ni el filtro del agente
laboral (`["despido","rubros-laborales"]`) ni el `IS NULL`, dejándolos invisibles cuando
el agente pasa filtro de subcategoría. Se corrigió con un `UPDATE ... SET subcategoria = NULL`
(la subcategoría es metadata del `Document`; no requiere re-chunk ni re-embedding).

## Inventario ingestado (46)

### laboral / transversal (`subcategoria = NULL`) — 4
- Laboral — Prescripción de acciones y créditos laborales (Ley 18.091) — 2 chunks
- Laboral — Proceso laboral: gratuidad para el trabajador y principios (Ley 18.572) — 1 chunk
- Laboral — Proceso laboral: conciliación previa ante el MTSS (Ley 18.572) — 1 chunk
- Laboral — Proceso laboral: actualización, intereses y recargo del crédito laboral (Ley 18.572) — 1 chunk

### laboral / despido — 19
- Despido — Extinción del contrato de trabajo: tipologías y causas ajenas a la voluntad — 6 chunks
- Despido — Renuncia y abandono del trabajador — 3 chunks
- Despido — Modalidades de despido — 1 chunk
- Despido — Notoria mala conducta — 4 chunks
- Despido — Cálculo de la indemnización: trabajador mensual — 9 chunks
- Despido — Cálculo de la indemnización: jornalero, destajista y por hora — 5 chunks
- Despido — Despido abusivo y daño moral — 4 chunks
- Despido — Protección de la maternidad ante el despido: normativa — 2 chunks
- Despido — Subsidio por maternidad (BPS): condiciones y trámite — 3 chunks
- Despido — Indemnización especial por gravidez: requisitos, exoneraciones y estabilidad — 11 chunks
- Despido — Despido especial por enfermedad común — 6 chunks
- Despido — Despido especial por accidente de trabajo o enfermedad profesional — 5 chunks
- Despido — Despido especial por acoso sexual — 4 chunks
- Despido — Despido y violencia de género: estabilidad laboral — 2 chunks
- Despido — Trabajo nocturno y despido — 5 chunks
- Despido — Despido del trabajador con discapacidad — 2 chunks
- Despido — Viajantes y vendedores de plaza — 6 chunks
- Despido — Trabajador rural y trabajadora doméstica — 3 chunks
- Despido — Tratamiento fiscal (IRPF) y despido ad nutum — 3 chunks

### laboral / rubros-laborales — 23
- Rubros laborales — Descanso semanal trabajado y feriados: remuneración — 3 chunks
- Rubros laborales — Licencia anual: derecho, generación y trabajo computable — 4 chunks
- Rubros laborales — Licencia anual: duración, antigüedad, goce y fraccionamiento — 3 chunks
- Rubros laborales — Licencia anual: remuneración y jornal de vacaciones — 5 chunks
- Rubros laborales — Licencia anual: enajenación, egreso, aportes y licencia no gozada — 2 chunks
- Rubros laborales — Salario vacacional — 2 chunks
- Rubros laborales — Aguinaldo: concepto, cálculo y beneficiarios — 2 chunks
- Rubros laborales — Aguinaldo: partidas computables, pago y egreso — 2 chunks
- Rubros laborales — Jornada de trabajo: límites y excepciones — 2 chunks
- Rubros laborales — Horas extras: régimen y recargos — 3 chunks
- Rubros laborales — Incidencia de las horas extras en licencia, salario vacacional, aguinaldo e indemnización — 1 chunk
- Rubros laborales — Tiempo in itinere — 2 chunks
- Rubros laborales — Descansos intermedios — 2 chunks
- Rubros laborales — Concepto de remuneración y remuneraciones por mandato legal — 1 chunk
- Rubros laborales — Remuneración en dinero y en especie: criterios de calificación — 2 chunks
- Rubros laborales — Percepciones no remunerativas — 2 chunks
- Rubros laborales — Sistemas de remuneración: por tiempo y por resultados — 2 chunks
- Rubros laborales — Concepto, naturaleza y morfología del salario — 2 chunks
- Rubros laborales — Prestaciones en especie: vivienda, alimentación, vestimenta y transporte — 2 chunks
- Rubros laborales — Prestaciones en dinero: viáticos, propinas, comisiones, gratificaciones y primas — 2 chunks
- Rubros laborales — Diferencia de salario: cálculo del reclamo — 1 chunk
- Rubros laborales — Trabajo nocturno: concepto y sobretasa — 3 chunks
- Rubros laborales — Trabajo nocturno: trabajadores no aptos y trabajadora grávida — 4 chunks

## NO ingestado (a propósito)

- `backend/corpus/uy-ley-17250-defensa-consumidor.txt` (Ley 17.250, Defensa del
  Consumidor): la categoría **consumidor no está habilitada** y no hay agente que la
  consuma. Queda para cuando se habilite esa categoría (requiere su agente, ver
  `docs/guia-arquitectura.md §2`).

## Cómo se ejecutó

- `pnpm ingest` es de a un archivo e idempotente por `--title` (`ON CONFLICT (title) DO UPDATE`);
  re-correr re-ingesta sin duplicar. Batch con título tomado del `# ` de cada `.md` y
  categoría/subcategoría del path.
- Corrida desde local con `backend/.env` apuntando temporalmente a la DB de prod por el
  **proxy TCP público** (`shuttle.proxy.rlwy.net:51031` — host distinto del `up.railway.app`,
  que es el dominio HTTP). El backend en vivo usa la misma base por red privada.

## Verificación

- Conteos y estado (query directa): 46 `Document` READY, 143 `DocumentChunk`, 0 huérfanos,
  extensiones `vector`+`pgcrypto`.
- E2E: consulta real al chat de prod → `buscar-documentos` → respuesta con cita de fuente
  (Ley 18.091 arts. 1-3).
- Sin cambios de código, rules, skills ni golden set → no se corrió `pnpm evals` (el gate
  actual es el matcher de clasificación, ortogonal al corpus). Con el corpus ya cargado
  queda desbloqueado construir scorers de fidelidad de cita (LLM-as-judge), ver
  `.claude/rules/eval-design.md` — trabajo aparte.
