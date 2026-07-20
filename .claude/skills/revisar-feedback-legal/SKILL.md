---
name: revisar-feedback-legal
description: Use cuando haya notas abiertas del equipo legal en sesiones de revisión (/revision), o cuando el equipo pida procesar el feedback de una sesión — diagnóstico sobre la timeline con spans, triage por nota, fix, eval anti-regresión y respuesta al experto.
---

# Revisar feedback del equipo legal

Cierra el loop de mejora continua: los expertos legales prueban el sistema en
`/revision` y dejan notas; acá cada nota se diagnostica sobre la timeline
completa (mensajes + tool calls con input/output + agente por turno), se
convierte en un fix con su eval, y se le responde al experto.

**Anunciar al inicio:** "Procesando el feedback con la skill revisar-feedback-legal."

**Guías de fondo:** `.claude/rules/eval-design.md` (open coding del primer
fallo upstream), `.claude/rules/rules-and-skills-taxonomy.md` (destinos),
`.claude/rules/agent-prompting.md` (cómo escribir el fix),
`docs/plans/2026-07-20-sistema-revision-feedback-legal.md` (diseño del sistema).

## Checklist (crear un todo por fase)

### Fase 1 — Pull
- Correr `pnpm feedback:pull` (workspace `frontend/`). Los markdown quedan en
  `tmp/feedback-legal/<conversationId>.md` (no versionados).
- Leer CADA archivo ENTERO antes de tocar nada.

### Fase 2 — Diagnóstico por nota (open coding)
Para CADA nota abierta, sobre la timeline:
- Identificar el PRIMER fallo upstream (no los síntomas en cascada). La
  evidencia está en los tool calls: ¿`buscar-documentos` devolvió el dato y el
  agente lo ignoró (prompt)? ¿no lo devolvió (hueco de corpus o retrieval)?
  ¿`asignar-clasificacion`/`registrar-caso` corrieron cuando/como debían?
- Anotar el diagnóstico en una línea, con el spanId/messageId de la evidencia.

### Fase 3 — Triage por nota
Destino del fix (uno o varios): rule · skill · RAG (`pnpm ingest`) · eval ·
pregunta al equipo legal (`docs/preguntas-legales/`, enviable) · bug de código.
Usar el árbol de decisión de `rules-and-skills-taxonomy.md`. Si la duda es de
dominio legal (criterio, plazo, alcance), NO resolver por cuenta propia:
registrar la pregunta enviable (regla SIEMPRE de `CLAUDE.md`).

### Fase 4 — Implementar
- Fix de prompt/rule/skill: seguir `agent-prompting.md` y validar con `pnpm evals`.
- Contenido legal nuevo: pasa por la skill `procesar-documento-legal`, no por acá.
- Bug de código: test primero, fix después.

### Fase 5 — Eval anti-regresión
Si la nota reveló un fallo de comportamiento, agregar el caso al golden set
(`backend/src/test/`) para que el fallo no vuelva silenciosamente. Una nota
resuelta sin eval es un parche, no una mejora.

### Fase 6 — Responder al experto
- `pnpm feedback:respond --nota <id> --texto "..."` (o `--archivo`).
- Voz para abogados, sin jerga técnica (misma voz que `docs/preguntas-legales/`):
  qué se corrigió (o qué se necesita aclarar), y si aplica, invitación a
  re-probar el escenario en una sesión nueva.
- `--resolver` solo si no queda nada pendiente del lado dev y no se espera
  re-test del experto; si se espera confirmación, dejarla RESPONDIDA.
- Pedidos de aclaración generales: `--sesion <conversationId> --texto "..."`.

### Fase 7 — Resumen del ciclo
Reportar: notas procesadas, fixes por destino, evals nuevos, preguntas
enviadas al equipo legal, notas que quedaron esperando aclaración.
