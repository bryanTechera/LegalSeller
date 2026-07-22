# Revisión de feedback legal — sesión "Test 1" (Federico, 2026-07-22)

Ciclo procesado con la skill `revisar-feedback-legal` sobre la sesión de revisión
`cmruznzrb000np602b2pwfpje` (6 notas abiertas). Timeline completa en
`tmp/feedback-legal/` (no versionada; regenerable con `pnpm feedback:pull`).

## Diagnóstico por nota (primer fallo upstream)

| Nota | Observación del experto | Primer fallo upstream | Evidencia |
|---|---|---|---|
| `cmrvc1pgg0014pg02qx9rrd4h` | No citar la fuente salvo que la pregunten; en ese caso usar la frase institucional de Jurco | La rule `conducta-laboral` ordenaba "SIEMPRE citá la fuente (título del documento y sección)" — el agente obedeció una política user-facing equivocada | messageId `b28fe6af` |
| `cmrvcisui001gpg027pucg4uo` | "También se cita a Rubros laborales — Horas extras…" | Mismo bucket que la anterior | messageId `06cd1e25` |
| `cmrvcx6oh001npg02wwp3706e` | El asistente dice "el documento menciona…" | Mismo bucket; además no existía prohibición de exponer la mecánica interna del conocimiento (la cuarta pared cubría solo UI) | messageId `e10a8d1b` ("Revisé mi base de documentos") |
| `cmrvcahyc0016pg027rb55sqw` | Afirmó despido triple tras reintegro efectivo; el material dice salarios hasta completar 180 días + IPD común | Afirmación de consecuencia normativa de un régimen (accidente) sin `buscar-documentos` de ese régimen en el turno (solo registró caso y memoria); el matiz correcto ya estaba en el corpus (`12-despido-especial-accidente.md`) | messageId `b28fe6af`, tool-calls del turno 00:14:59 |
| `cmrvd0ilt001ppg028dr17csq` | "Telegrama enviado" no interrumpe la prescripción | Fabricación por extensión: la búsqueda devolvió la Ley 18.091 con enumeración cerrada de mecanismos de interrupción y el agente agregó el telegrama como probable interruptor | messageId `59a79185` |
| `cmrvh1q6q001tpg02a0dosm18` | La respuesta es correcta "por razones casuales": rige el art. 66 de la ley 16.074, no la 19.889 | Hueco de corpus: el art. 66 no estaba ingestado; el agente completó con conocimiento general | messageId `3d3be50f` + output de `buscar-documentos` 02:29 |

## Failure taxonomy (buckets de este ciclo)

1. **Exposición de mecánica interna** (3 notas) — títulos de documentos, "documento", "corpus", "base de documentos".
2. **Fabricación por extensión del texto recuperado** (2 notas) — generalizar consecuencias condicionadas; agregar ítems a enumeraciones cerradas; no re-buscar al cambiar de régimen.
3. **Hueco de corpus** (1 nota) — art. 66 ley 16.074.

## Fixes por destino

- **Rule `conducta-laboral`** (reescritura): fuentes de uso interno (sin títulos ni
  vocabulario de mecánica interna; frase institucional de Jurco ante la pregunta por el
  origen); búsqueda nueva por cada régimen/instituto; fidelidad a condiciones e
  hipótesis del texto recuperado (enumeraciones cerradas). Ajustes de vocabulario
  coherentes en `rol-especialista-laboral`, `dimensionar-despido`, `dimensionar-rubros`
  y `mision-clasificacion` ("citalos"/"corpus" → "material de respaldo"/"respaldo
  normativo") para no contradecir el ensamblado ni inducir el vocabulario filtrable.
- **RAG**: ver `2026-07-22-procesamiento-notas-revision-prescripcion.md` (art. 66 ley
  16.074 nuevo; sección "Qué no interrumpe la prescripción" en el doc de la Ley 18.091;
  la doctrina de los 180 días ya existía — descartada por duplicada).
- **Evals**: dataset nuevo `voz-fuentes.json` (6 items; matcher programático de
  referencias internas + frase institucional) y 2 items nuevos en `citacion.json`
  (accidente+reintegro; telegrama). Gate `pnpm evals` extendido a 3 datasets.
- **Docs**: CLAUDE.md (regla "SIEMPRE citar la fuente" → "SIEMPRE fundar en el corpus,
  fuentes internas"), `agent-prompting.md`, `rules-and-skills-taxonomy.md`,
  `eval-design.md`, `guia-codificacion-backend.md` — barrido de los ejemplos que
  prescribían citación user-facing.
- **Pregunta al equipo legal**: `docs/preguntas-legales/2026-07-22-prescripcion-accidentes-trabajo.md`
  (deslinde art. 66 ley 16.074 vs. ley 18.091 para el despido especial del art. 69).

## Decisión de política registrada

La regla de producto "SIEMPRE citar la fuente" cambia de cara: la **fundamentación** en
el corpus vía `buscar-documentos` sigue siendo obligatoria (anti-fabricación, mismo
gate de citación en evals), pero la **exhibición** de fuentes al consultante queda
prohibida; ante la pregunta por el origen, la respuesta es la frase institucional
definida por el equipo legal (nota `cmrvc1pgg`). Origen: decisión del equipo legal en
la sesión de revisión del 2026-07-22.

## Verificación

`pnpm test` 53/53 · `pnpm lint` limpio · `pnpm evals`: clasificación 19/19 (100 %),
citación 14/14 (100 %), voz-fuentes 6/6 (100 %) — threshold 90 %.

## Respuestas al experto

Las 6 notas quedaron RESPONDIDAS vía `pnpm feedback:respond` (sin `--resolver`: se
espera re-test del experto en una sesión nueva).
