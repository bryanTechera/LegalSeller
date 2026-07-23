# Review de la sesión "Probando fallos anteriores" (2026-07-23)

Ciclo de `revisar-feedback-legal` sobre la sesión de prueba de Federico
(`cmrwt7hsi0015lg02dfsoncay`, 23/07 01:06–02:42Z, **sin notas** — el diagnóstico
es del equipo técnico sobre la timeline completa, exportada a
`tmp/feedback-legal/`). La sesión corrió contra el deploy `e070e9e` (PR #8), es
decir con las iteraciones 1-3 del fix de captación ya activas.

## Hallazgos (open coding, primer fallo upstream)

1. **[Alta] Insistencia del pedido de contacto persiste** — pedido en 6 de 8
   turnos. Primer fallo upstream: el único `updateWorkingMemory` (turno 1) asentó
   "Pedido de contacto ya realizado: no" en el mismo turno en que pidió, y nunca
   se re-actualizó. Diagnóstico completo e iteración 4 en
   `2026-07-22-feedback-captacion-insistente.md`.
2. **[Alta] Fabricación de beneficio sectorial** (turno "guardia de seguridad"):
   afirmó "Grupo 19, subgrupo 08" y nocturnidad "desde la primera hora" cuando
   los 5 chunks de `buscar-documentos` eran solo la ley 19.313 general. Violación
   de `conducta-laboral` ("si la búsqueda no trae el dato, no lo completes con
   conocimiento general") + hueco de corpus (no hay laudos).
3. **[Media] Despido triple mal aplicado** (turno 1): el chunk condicionaba el
   triple a la NO readmisión; el agente lo afirmó para un trabajador readmitido y
   despedido a los 15 días. Se auto-corrigió recién ante el pushback del usuario
   citando al MTSS (la posición mayoritaria — IPD común + salarios para completar
   los 180 días — estaba en el corpus).
4. **[Media] Cálculo de IPD sin búsqueda propia** (turno "5 años / $30.000"):
   dimensionó el reclamo sin llamar `buscar-documentos` en ese turno; la regla de
   "cada cuestión normativa nueva necesita su búsqueda" no se activó para el
   instituto del cálculo de la IPD común.

Positivos verificados (fallos anteriores que no reprodujeron): contexto temporal
("hoy es julio de 2026" contra accidente 2015), telegrama colacionado fiel al
corpus, prescripciones 1 año / 10 años distinguidas, clasificación proactiva
correcta, sin ruptura de cuarta pared ni mención de fuentes internas.

## Triage y fixes

| Hallazgo | Destino | Fix |
|---|---|---|
| 1 Insistencia | bug de código + rule + escenario | Fix estructural (iteración 5): el BFF deriva "pedido ya hecho" del historial y la rule `captacion-caso` es condicional a `readOnly.pedidoContactoHecho`; escenario `despido-bse-contacto-ignorado` con expectativa nueva `pedidoContactoUnaVez`. Detalle en `2026-07-22-feedback-captacion-insistente.md` §iteraciones 4-5 |
| 2 Fabricación sectorial | eval + rule + pregunta legal | Eval `laboral-fidelidad` (prohibido "grupo 19"/"subgrupo"/"desde la primera hora"; requiere la condición de horas consecutivas); directiva de laudos + par contrastivo en `conducta-laboral`; pregunta enviable `docs/preguntas-legales/2026-07-23-laudos-consejos-salarios.md` |
| 3 Triple mal aplicado | eval + rule | Eval `laboral-fidelidad` (la respuesta al caso BSE-readmitido debe citar los 180 días y no traer el "triple" inaplicable); directiva de hipótesis + par contrastivo en `conducta-laboral` |
| 4 IPD sin búsqueda | eval | Ítem multi-turno nuevo en `citacion.json` (el turno del cálculo debe disparar su propia búsqueda); `evalCitacion` ahora acepta historia de mensajes |

**Loop Define→Test→Diagnose→Fix de fidelidad.** El triage inicial fue "la rule
`conducta-laboral` ya lo prohíbe; alcanza con la eval como gate" — la eval lo
refutó: 0/2 en dos corridas (el prompt vigente reproduce ambos fallos de forma
confiable, no fueron one-offs). Primera vuelta: dos directivas nuevas
(verificación de hipótesis del régimen; laudos sectoriales solo si la búsqueda
los trae) — siguió 0/2: el dump de respuestas mostró el caso BSE ya correcto
pero inestable, y la fabricación del laudo intacta ("suele haber convenios…
desde la primera hora"). Segunda vuelta: par contrastivo MAL/BIEN por
constraint (el mecanismo de `agent-prompting.md` para constraints crónicamente
violados) — 2/2 en dos corridas consecutivas.

## Estado

- Sin notas del experto → no hay `feedback:respond` para esta sesión.
- Pregunta a los abogados RESPONDIDA (2026-07-23): el equipo legal ratificó el
  modo (b) — solo regla general + derivación, sin contenido sectorial de laudos.
  Procesamiento de las respuestas en
  `2026-07-23-procesamiento-respuestas-laudos-consejos-salarios.md`.
- Queda abierta la sesión "test bryan 2" con 2 notas de prueba ("test") de
  Bryan-1, a resolver o descartar por el equipo técnico.
