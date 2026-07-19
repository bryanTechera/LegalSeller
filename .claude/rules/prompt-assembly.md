# Prompt Assembly — ensamblado del system prompt

> Sources: src/mastra/common/activation-registry.ts, src/mastra/rules/index.ts,
> src/mastra/skills/index.ts, src/mastra/skills/tool-skills/index.ts.
> Spec: docs/plans/2026-07-19-sistema-skills-rules-prompting.md

## Flujo end-to-end

1. Request entra a `/api/agents/:id/stream` con el `requestContext` que manda el BFF;
   Mastra lo auto-mergea al RuntimeContext (no hay middleware custom — solo lectores
   tipados en `common/middleware/index.ts`). El `ReadOnlyState` viaja bajo la key
   `readOnly` y se lee con `getReadOnlyFromContext`.
2. `crearAgente` resuelve instructions vía `buildDynamicInstructions` (null-guard
   asimétrico: startup sin contexto → string vacío; request real → throw si el
   build falla).
3. El `instructions.ts` del dominio compone:
   rules.inicio → static skills → rules.final → bloques volátiles (brief/usuario).
4. `ActivationRegistry.execute(readOnly, agentId)` filtra por agente (CONTENT map),
   concatena con \n\n en orden de registración y devuelve
   { inicio, final, activatedIds, failedIds }.

## Orden y atención

- El orden global de registración ES el orden del prompt; el subset por agente lo
  preserva. Contenido estable primero (cache implícito de Gemini), conocimiento en
  el medio, directivas de comportamiento con recencia al final (posicion: "final",
  hoy: captacion-caso), volátil último.
- Sin wrapper de capa: cada rule/skill lleva su propio tag XML en el contenido
  (decisión del spec §4.3 — preserva los prompts verificados en vivo).

## Rules críticas y error paths

- `critical: true` → si su fn tira con un request real, el prompt no se construye y
  el agente no corre (CRITICAL_RULE_IDS se deriva de la registración).
- Item no crítico que tira → se omite del prompt, va a failedIds y se loggea
  (nunca silent omission).

## Cómo agregar

- **Rule nueva**: archivo en `src/mastra/dominios/<dominio>/rules/<id>.ts`
  (CONTENT map + función `<id>Rule`), entrada en RULES de `src/mastra/rules/index.ts`
  en la posición de atención correcta, test de activación.
- **Static skill nueva**: análogo en `static-skills/` + `src/mastra/skills/index.ts`.
- **Tool skill nueva**: definición `SkillToolDefinition` en `tool-skills/` del
  dominio + registrarla en TOOL_SKILLS de `src/mastra/skills/tool-skills/index.ts`.
  La tool se publica como `guia-<id>`. Revisar si necesita anchor en una rule
  (ver rules-and-skills-taxonomy.md y la skill procesar-documento-legal).
- **Byte-igualdad como técnica**: para refactors de estructura de prompt sin cambio
  de contenido, congelar el prompt actual en un fixture y asertar igualdad exacta
  (ver src/test/instructions-migracion.test.ts). Para cambios de contenido, el gate
  es `pnpm evals`.
