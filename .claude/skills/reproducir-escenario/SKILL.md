---
name: reproducir-escenario
description: Use cuando el equipo pida reproducir un caso o escenario, probar el sistema como usuario, o diagnosticar una conversación punta a punta — corre el runner pnpm escenario (vía /revision), improvisa en personaje si hace falta y analiza el reporte (tool-calls, latencias, caso).
---

# Reproducir escenario

Reproduce conversaciones de prueba contra el sistema por el mismo pipeline que un
consultante real (orchestrateChatTurn vía los endpoints de /revision), con
introspección completa: tool-calls con args, latencias por turno y snapshot del
Caso. Las corridas quedan como sesiones de revisión autónomas (borrador hasta
publicarlas). Spec: `docs/plans/2026-07-22-sistema-escenarios-reproducibles.md`.

**Anunciar al inicio:** "Reproduciendo el escenario con la skill reproducir-escenario."

## Checklist (crear un todo por fase)

### Fase 1 — Resolver el escenario
- Buscar el slug pedido en `frontend/escenarios/`. Si no existe, crear el archivo
  JSON siguiendo el formato del spec §2:
  - `persona` con hechos concretos uruguayos y datos de contacto FICTICIOS
    (la corrida crea un Caso real en la base, aunque excluido de métricas).
  - `turnos`: guion de 3-6 mensajes en voz de consultante real (coloquial,
    minúsculas, a veces sin tildes) — la fidelidad incluye cómo escribe la gente.
  - `expectativas`: solo las que el escenario viene a validar, no todas siempre.
- El escenario nuevo se versiona en git: es lo que vuelve reproducible el pedido.

### Fase 2 — Precondiciones
- Confirmar el entorno objetivo (default: prod). Si lo que se quiere probar es un
  cambio reciente, verificar ANTES que el deploy de Railway que lo incluye esté en
  SUCCESS — reproducir contra prod un cambio que aún no llegó es el falso
  negativo clásico.
- Verificar que `REVISION_CLAVE` (en `frontend/.env`) sea la clave del entorno
  objetivo; para otro entorno, pasar `--clave` / `--url`.

### Fase 3 — Correr e improvisar
- `cd frontend && pnpm escenario correr <slug>`.
- Si el agente pregunta algo que el guion no cubre, responder con
  `pnpm escenario continuar <sesionId> --mensaje "..."` EN PERSONAJE:
  - Solo hechos de la `persona`; nunca contradecirla.
  - Si falta un hecho, definirlo con criterio y AGREGARLO a la `persona` del
    archivo del escenario (la próxima corrida lo tiene; el turno igual queda
    marcado `improvisado` en el reporte).
  - Nunca romper la cuarta pared ni usar lenguaje técnico-legal que un
    consultante real no usaría — eso invalida la prueba.

### Fase 4 — Analizar el reporte
Sobre `escenarios/corridas/<slug>/<timestamp>.md` (y el `.json` como fuente):
- **Clasificación**: ¿correcta y oportuna (en el primer turno con señal
  suficiente)? ¿`corregir-clasificacion` usado como corresponde?
- **Respaldo**: ¿cada afirmación normativa tiene un `buscar-documentos` previo con
  filtros correctos (categoria/subcategorias)? ¿Afirmó algo que la tool no trajo?
- **Captación**: ¿`registrar-caso` proactivo (datos registrados apenas
  aparecieron)? ¿Contacto en el Caso, estado esperado, brief fiel a la
  conversación?
- **Voz**: ¿referencias internas ("documento", "corpus", títulos), referencias a
  la UI, frase institucional Jurco ante la pregunta por el origen?
- **Ineficiencias**: búsquedas redundantes (misma consulta repetida), turnos de
  más para captar, latencias anómalas.

### Fase 5 — Cierre
- Resumir los hallazgos con evidencia (turno + tool-call).
- Triage de cada problema con el mismo árbol que `revisar-feedback-legal`:
  rule · skill · RAG · eval · pregunta enviable al equipo legal
  (`docs/preguntas-legales/`) · bug de código. Las dudas de dominio legal NUNCA
  se resuelven por cuenta propia (regla SIEMPRE de `CLAUDE.md`).
- Publicar la corrida (`pnpm escenario publicar <sesionId>`) SOLO si aporta al
  equipo legal — el listado compartido muestra corridas curadas, no debugging.

## Red flags
- Leer una corrida contra prod como señal sin verificar que el cambio esté
  deployado.
- Improvisar hechos que contradicen la persona, o "ayudarle" al agente.
- Publicar corridas de debugging.
- Tratar las expectativas como gate (el gate es `pnpm evals`).
- Convertir un hallazgo de dominio legal en fix sin la pregunta al equipo legal.
