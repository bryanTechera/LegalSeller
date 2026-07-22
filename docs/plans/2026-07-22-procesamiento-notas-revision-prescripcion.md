# Procesamiento de material legal — notas de revisión sobre prescripción (2026-07-22)

Material del equipo legal llegado vía notas de la sesión de revisión "Test 1"
(Federico, 2026-07-22), procesado con la skill `procesar-documento-legal`. Contexto del
ciclo en `2026-07-22-revision-feedback-legal-sesion-test-1.md`.

## Piezas y destinos

| Pieza | Origen | Destino | Implementación |
|---|---|---|---|
| Art. 66 ley 16.074 (prescripción decenal de las obligaciones de la ley de accidentes de trabajo + suspensión por recursos; no aplica la ley 19.889) | Nota `cmrvh1q6q` | **RAG** (texto normativo citable, Uruguay, el modelo no lo tiene con precisión) | `backend/corpus/laboral/generales/05-prescripcion-accidentes-trabajo.md`, ingestado a prod con título "Laboral — Prescripción de las acciones por accidente de trabajo (Ley 16.074, art. 66)", categoría `laboral`, subcategoría NULL (transversal, como el resto de `generales/`) |
| El telegrama colacionado no equivale a solicitud de audiencia ante el MTSS ni a gestión jurisdiccional — no interrumpe la prescripción | Nota `cmrvd0ilt` | **RAG** (aclaración de alcance normativo; debe recuperarse junto al régimen de prescripción) | Sección nueva "Qué no interrumpe la prescripción" en `01-prescripcion-acciones-creditos.md`; re-ingesta del documento existente (mismo `documentId`, ahora 2 chunks) |
| Doctrina de la sanción por despido dentro de los 180 días post-reintegro efectivo (salarios caídos + IPD común, no triple) | Nota `cmrvcahyc` | **DISCARD** — ya existe igual de precisa en `12-despido-especial-accidente.md` ("salarios que faltaren…"); el fallo fue de comportamiento, cubierto por la rule | Sin cambios de corpus |

Sin piezas para skill ni rule desde este material (la reescritura de `conducta-laboral`
salió del diagnóstico del ciclo, no de contenido legal nuevo). Sin categorías ni
subcategorías nuevas.

## Verificación post-ingesta (DB de producción)

47 documentos READY, 0 chunks huérfanos; ambos documentos de prescripción con
`subcategoria` NULL. Ingesta corrida desde local con `backend/.env` apuntando al proxy
TCP de prod (mismo mecanismo que la ingesta inicial del 2026-07-21).

## Evals

- `citacion.json`: +2 items (accidente con reintegro y despido a los 7 días; telegrama
  colacionado y plazo) — ambos deben disparar `buscar-documentos`.
- El contenido nuevo queda cubierto además por `voz-fuentes.json` (el item del
  telegrama verifica que la respuesta no exponga mecánica interna).
- `pnpm evals` verde: 19/19 · 14/14 · 6/6.

## Pregunta abierta al equipo legal

`docs/preguntas-legales/2026-07-22-prescripcion-accidentes-trabajo.md` (PENDIENTE):
¿el plazo decenal del art. 66 alcanza al reclamo del despido especial del art. 69, o
ese sigue el régimen de la ley 18.091? Hasta la respuesta, el corpus solo afirma el
alcance textual del art. 66 y el sistema no se pronuncia sobre ese deslinde.
