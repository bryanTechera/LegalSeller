# Feedback legal: pedido de contacto insistente — fix de captación (2026-07-22)

Ciclo de `revisar-feedback-legal` sobre feedback **verbal** del equipo legal (vía
Bryan, sin nota en `/revision`): el agente pide los datos de contacto en los
primeros turnos de forma insistente. El mismo patrón se había detectado en la
primera corrida del runner de escenarios (`divorcio-con-hijos-visitas`,
publicada al listado de revisión): pedido de contacto en los turnos 1, 2 y 3
consecutivos, sin que la consultante lo hubiera ofrecido ni rechazado.

## Diagnóstico (primer fallo upstream)

La rule `captacion-caso` ya decía "Hacelo una sola vez con naturalidad; si el
usuario no quiere, seguí ayudando igual" — y el agente igual repitió el pedido.
Dos causas, ambas de prompt:

1. **Scope no explícito**: "una sola vez" (¿por conversación? ¿por oportunidad?)
   quedaba enterrado a mitad de bullet. Los modelos actuales siguen el scope
   literal (`agent-prompting.md § Declará el scope explícito`).
2. **El caso real no estaba cubierto**: la consultante no *rechazó* el pedido —
   lo *ignoró* y siguió preguntando. "Si el usuario no quiere" nunca se activó,
   el pedido quedaba "pendiente" y el agente lo repetía turno a turno.

Evidencia: corrida `frontend/escenarios/corridas/divorcio-con-hijos-visitas/`
(2026-07-22T19-22-53), turnos 1-3.

## Fix (rule `captacion-caso`, compartida laboral + familia) — 2 iteraciones

**Iteración 1 (insuficiente):** partir el bullet en dos con scope explícito
("una sola vez en toda la conversación") y el caso "ignorado" cubierto con su
motivación. La eval nueva la refutó: 0/2 laboral, 1/2 familia — el agente
espeja el CTA de su propio turno anterior (el historial termina con un pedido
de contacto) y la directiva en prosa no le gana a ese prior.

**Iteración 2 (la que quedó):** las dos armas de `agent-prompting.md` para
constraints crónicamente violados:

- **Check pre-cierre sobre la conversación** (oracle externo = el historial, no
  auto-crítica): "antes de cerrar cada respuesta, revisá tus mensajes
  anteriores: si ya pediste el contacto y el usuario siguió consultando sin
  darlo, cerrá esta respuesta sin mencionar el contacto"; retomarlo solo ante
  señal del usuario de querer avanzar.
- **Par contrastivo** MAL/BIEN en `<ejemplo>` (1 par, formato/conducta — no
  prescribe razonamiento legal): mismo escenario de pedido ignorado, cierre
  malo re-pidiendo vs. cierre bueno que sigue relevando el caso.

## Eval anti-regresión

`evalCaptacion` en `run-evals.ts` + datasets `agents/{laboral,familia}/datasets/captacion.json`:
ítems **multi-turno** (primera eval con historia de mensajes) que reproducen la
falla exacta — el asistente ya pidió contacto (fixture), el usuario lo ignoró y
siguió con otra duda; la respuesta no debe volver a pedirlo (regexes
`PEDIDO_CONTACTO` con las formulaciones observadas en corridas reales). Gate en
el threshold estándar (90%). La eval hizo su trabajo en vivo: refutó la
iteración 1 del fix antes de que llegara a un PR.

Además, el runner ganó un filtro de datasets para iterar sin pagar la suite
completa: `pnpm evals [filtro]` (ej. `pnpm evals captacion`).

## Verificación en prod e iteración 3

Re-corrida del escenario `divorcio-con-hijos-visitas` contra prod tras el deploy
de la iteración 2 (corrida 2026-07-22T20-26-05): mejora clara pero parcial —
los turnos 3 y 4 ya no piden contacto (el turno 3 cierra relevando el caso, el
patrón BIEN del ejemplo), pero el turno 2 repitió el pedido una vez.

**Causa de la divergencia prod vs. eval**: en prod el agente carga la memoria
de trabajo, cuyo template trackea "Datos de contacto ya aportados: Ninguno" —
una señal permanente de "falta el contacto" — y no tiene ningún campo que
recuerde que el pedido ya se hizo. La eval (sin memoria) no reproduce ese
empuje.

**Iteración 3**: campo nuevo en el template de working memory
(`Pedido de contacto ya realizado (sí/no)`) + la rule asienta ese campo al
pedir y lo consulta en el check pre-cierre. El estado "ya pedí" pasa a ser
durable en vez de depender de que el modelo re-escanee el historial.

## Estado

- Sin nota en `/revision` → no hay `feedback:respond`; el canal de vuelta es el
  equipo técnico.
- La conducta quedó a la vista del equipo legal en la corrida publicada; si al
  re-probar quieren otro balance de venta (pedir más tarde, otra formulación),
  se ajusta sobre esta misma rule.
