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

## Verificación en prod e iteración 4 (review sesión "Probando fallos anteriores", 2026-07-23)

La sesión de Federico del 23/07 — corrida contra el deploy que YA incluía la
iteración 3 (deploy de `e070e9e` activo desde las 21:42Z del 22/07; sesión de
01:06Z a 02:42Z del 23/07) — volvió a mostrar la insistencia: pedido de contacto
en 6 de 8 turnos. Primer fallo upstream (timeline
`tmp/feedback-legal/cmrwt7hsi0015lg02dfsoncay.md`): el ÚNICO `updateWorkingMemory`
de la sesión (turno 1) asentó "Pedido de contacto ya realizado: no" en el mismo
turno cuya respuesta pidió el contacto, y nunca volvió a actualizarse. El modelo
hace el update de memoria antes de redactar la respuesta y evalúa el estado en ese
momento ("todavía no lo pedí") — "al hacerlo, asentá sí" no fija el orden. Peor:
la memoria en "no" es una señal explícita que le gana al check pre-cierre sobre el
historial (iteración 2), y con `lastMessages: 10` los primeros pedidos van
saliendo de la ventana a medida que la conversación crece.

**Iteración 4** (rule `captacion-caso`):

- Timing explícito del asiento: "cuando decidas pedirlo, asentá primero … 'sí' y
  recién después redactá la respuesta", con su motivación (asentarlo como "no"
  hace que el turno siguiente lo repita).
- Resolución del conflicto memoria vs. historial: un mensaje propio anterior que
  ya pidió el contacto prueba el pedido aunque la memoria diga "no" — corregir la
  memoria a "sí" y no repetirlo.

**Anti-regresión**: la eval sin memoria no reproduce esta divergencia (limitación
ya documentada en la iteración 3). Cobertura nueva por escenario reproducible:
`frontend/escenarios/despido-bse-contacto-ignorado.json` + expectativa
`pedidoContactoUnaVez` en el motor de expectativas del runner.

**Verificación pre-PR (corrida local 2026-07-23T13-31)**: la iteración 4 también
falló — 3 pedidos en 4 turnos. La corrida muestra el mecanismo completo: turno 1
asienta "No" y pide en la misma respuesta (el timing explícito tampoco se
cumplió); turno 2 lee "No" y re-pide; turno 3 corrige la memoria a "Sí" por la
regla de conflicto nueva… y aun así cierra pidiendo; recién el turno 4 (memoria
ya en "Sí" al inicio) no pide. Cuatro iteraciones de prompt parcialmente
fallidas = el problema no es de redacción: el LLM no administra a tiempo su
propio estado conversacional.

## Iteración 5 — estructural (2026-07-23): el estado sale del LLM

El estado "pedido de contacto ya hecho" pasa a derivarse por código:

- **BFF** (`chat-orchestrator.ts` · `callCategoryAgent`): antes de cada turno de
  agente de categoría, lee los mensajes del thread
  (`GET /api/memory/threads/:id/messages`, helper `fetchAssistantTexts` con
  extracción tolerante — el texto plano viaja anidado en `content.content`,
  verificado en vivo) y escanea los mensajes del asistente con
  `contienePedidoContacto` (`src/lib/pedido-contacto.ts`, módulo compartido con
  las expectativas del runner; espejo del eval runner del backend). Si la
  lectura falla, asume `false` y sigue (peor caso = comportamiento previo).
- **Contrato** — `readOnly.pedidoContactoHecho` viaja en el RequestContext
  (campo nuevo en `ReadOnlyState`).
- **Rule `captacion-caso` condicional**: sin pedido previo → variante base
  (pedido único cuando ya demostró entender el caso); con
  `pedidoContactoHecho: true` → variante que instruye cerrar sin mencionar el
  contacto (con el par contrastivo MAL/BIEN de la iteración 2), retomándolo
  solo ante intención de avanzar. Toda la coreografía de memoria de las
  iteraciones 3-4 se eliminó de la rule, y el campo
  "Pedido de contacto ya realizado" salió del template de working memory.
- **Eval**: `evalCaptacion` ahora manda `pedidoContactoHecho: true` en el
  RequestContext (sus fixtures son historias post-pedido — es el estado que el
  BFF derivaría).

### Iteración 5.1 — la rendija del "cómo seguir" y el cierre-trámite

La corrida contra prod post-merge del PR #9 (2026-07-23T14-33) dio 2 pedidos:
los turnos intermedios cumplieron, pero el turno del telegrama re-pidió. El
flag operó (sin warns en los logs de Railway): fue desobediencia de redacción,
por dos vías. (1) La variante permitía retomar si el usuario "pregunta cómo
seguir" — el modelo leyó "¿con telegrama interrumpo el plazo?" como eso.
(2) El cierre tipo "el próximo paso es un trámite que hace un abogado" hace
que ofrecer el contacto se sienta como completar la respuesta; el modelo lo
justificó con la urgencia del plazo. Una segunda corrida local con la rendija
cerrada pero sin salida sancionada reprodujo el mismo patrón.

Fix (rule `captacion-caso`, variante "ya pedido" + composers):

- Señal explícita solamente (acepta la derivación, pide contacto o deja un
  dato); "que siga preguntando — aun sobre plazos, trámites o pasos a
  seguir — no es esa señal", y la urgencia no justifica insistir.
- **Salida sancionada** para el cierre-trámite: ofrecer que el abogado de la
  red se encargue y que el usuario avise si quiere avanzar — sin pedir datos.
  El par contrastivo MAL/BIEN pasó a ese caso duro (el fácil ya lo cubre la
  eval).
- **Bloque volátil `<estado_captacion>`** al final absoluto del prompt
  (después de `<contexto_temporal>`) cuando el flag está activo: recordatorio
  de una línea con máxima recencia; la política completa queda en la rule.
- Ítem nuevo en la eval de captación (laboral): historia con pedido ignorado +
  "¿con telegrama colacionado interrumpo el plazo?" — el modo de fallo que la
  eval no cubría.

Verificación: captación 3/3 + 2/2; escenario local con 5.1: 1 pedido en 4
turnos y el turno del telegrama cerrando con la salida sancionada, dos
corridas consecutivas.

## Estado

- Sin nota en `/revision` → no hay `feedback:respond`; el canal de vuelta es el
  equipo técnico.
- La conducta quedó a la vista del equipo legal en la corrida publicada; si al
  re-probar quieren otro balance de venta (pedir más tarde, otra formulación),
  se ajusta sobre esta misma rule.
