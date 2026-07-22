# LegalSeller

MVP: varios agentes de IA conectados a un RAG sobre documentos legales. El sistema es un **vendedor experto de servicios legales**: evacúa dudas comunes con citas del corpus, genera confianza y capta el caso (contacto + información recabada) para que un equipo humano lo derive a un abogado de la red. Visión completa en `docs/vision-producto.md`.

## Arquitectura

Monorepo con dos servicios + Postgres (pgvector) compartida:

- `backend/` — servicio Mastra (TypeScript, ES Modules): agentes, tools, RAG. Server nativo de Mastra.
- `frontend/` — Next.js (App Router): UI + BFF (Prisma, proxy SSE al backend de agentes). **v1 sin registro/login**: chat directo en el home, identidad por cookie de sesión anónima (Auth.js queda como evolución).

Detalle completo en `docs/guia-arquitectura.md`.

## Documentación (fuente de verdad)

| Documento | Contenido |
|---|---|
| `docs/vision-producto.md` | Qué problema resuelve el sistema: funnel escuchar → evacuar dudas → captar caso → derivar a abogado; métricas e implicaciones técnicas |
| `docs/lineamientos-generales.md` | Stack, idiomas/naming, principios, git workflow, env vars |
| `docs/guia-arquitectura.md` | Servicios, RAG, canales de datos, deployment |
| `docs/dominio-consultas.md` | Taxonomía de categorías de consulta y roadmap — define agentes/sub-agentes y división de responsabilidades. **Habilitado: Laboral → Despido + Rubros laborales · Familia → sus 5 subcategorías (violencia de género con tratamiento diferencial, ver §4)** |
| `docs/guia-codificacion-backend.md` | Patrones Mastra: agentes, tools, prompting, evals, gotchas |
| `docs/guia-codificacion-frontend.md` | Patrones Next.js: RSC, route handlers, SWR/Zustand, testing |
| `docs/plans/` | Specs y planes de implementación fechados (registro de decisiones) |
| `.claude/rules/` | Guías operativas: taxonomía rules/skills/RAG, prompting de agentes, prompt assembly, eval design |

Ante conflicto entre reglas, seguir la más estricta.

## Reglas críticas

- **NUNCA** `any` — `unknown` + Zod. Contratos siempre como schema Zod, tipos con `z.infer`.
- **NUNCA** `console.log` en código de producción — logger estructurado.
- **NUNCA** push directo a `main`/`develop`; conventional commits; lint + tests antes de commit.
- **NUNCA** una tool de agente tira una excepción en `execute` — degradación graceful `{ status: "error", mensaje }`.
- **NUNCA** el browser habla directo con el backend Mastra o la DB — todo pasa por el BFF.
- **SIEMPRE** aislar recursos por identidad en las queries (en v1: `sessionId` de la cookie anónima; con auth futura: `userId`). Verificación siempre server-side.
- **SIEMPRE** fundar cada afirmación normativa de un agente en el texto que devolvió `buscar-documentos` (anti-fabricación). Las fuentes son de uso interno: el agente NUNCA expone al consultante títulos de documentos del corpus ni menciona "documento"/"corpus"/"PDF"; si le preguntan el origen de la información responde la frase institucional de Jurco (ver rule `conducta-laboral`). Decisión del equipo legal en la revisión del 2026-07-22 — reemplaza a la regla anterior "siempre citar la fuente" en su cara user-facing.
- **SIEMPRE** imports por subpath de Mastra (`@mastra/core/agent`), nunca el barrel.
- **SIEMPRE** ante ambigüedad de dominio legal (no técnica) — qué debe responder un agente, criterios/plazos legales, alcance del corpus — no asumir ni inventar: la duda se deriva al **equipo de expertos legales** que asiste al equipo técnico. Formular la pregunta concreta y registrarla en un archivo **enviable** al equipo legal en `docs/preguntas-legales/` (redactado para abogados, auto-contenido; ver skill `procesar-documento-legal` fase 6), referenciado desde el plan en `docs/plans/`, y seguir con lo no ambiguo (`docs/lineamientos-generales.md` §3.13).
- **SIEMPRE** procesar material nuevo del equipo legal con la skill `procesar-documento-legal` (`.claude/skills/`): triage por pieza hacia RAG/skill/rule, comparación con lo existente, evals. Nunca ingerir ni copiar contenido legal sin ese proceso.
- **SIEMPRE** procesar las notas del equipo legal en sesiones de revisión (`/revision`) con la skill `revisar-feedback-legal`: diagnóstico sobre la timeline con spans, triage, fix + eval anti-regresión, y respuesta al experto vía `pnpm feedback:respond`.
- Naming: código inglés camelCase; IDs Mastra y archivos kebab-case español; prosa user/agent-facing en español; tags XML de prompts en español.
- Gotchas de Mastra heredados de producción en `docs/guia-codificacion-backend.md` §3 (`maxSteps` en `defaultOptions`, `temperature: 1` explícito con gateway+Gemini, `keepAlive: true` en el pool, `MASTRA_DISABLE_STORAGE_INIT` en tests). Al descubrir un gotcha nuevo, documentarlo acá o en la guía correspondiente en el momento.
- Gotchas propios descubiertos en vivo (2026-07-19): `PostgresStore` requiere `id` no vacío desde `@mastra/pg` 1.16; el stream nativo de Mastra (`POST /api/agents/:id/stream`) emite eventos con el texto anidado en `payload.text` (no el formato AI SDK top-level) — el parser en `frontend/src/utils/sse.ts` acepta ambos; `PostgresStore` va con `schemaName: "mastra"` porque si crea sus tablas en `public`, `prisma migrate dev` las detecta como drift y propone resetear la base; `backend/vitest.config.ts` necesita también `GOOGLE_GENERATIVE_AI_API_KEY` no-op en `env` de test (`config/embedding.ts` tira excepción al importarse sin la key, no solo al usarla); `@typescript-eslint/restrict-template-expressions` rechaza `number` en template literals — placeholders SQL dinámicos (`$${n}`) van con `String(n)`; `server.apiRoutes` (custom routes) no puede vivir bajo el `apiPrefix` built-in (`/api` default) — Mastra tira `Error: ... must not start with "/api"` al boot; el endpoint de dominios quedó en `GET /dominios`, no `/api/dominios` como decía el plan original (`frontend/src/lib/dominios.ts` ya apunta ahí, con cache TTL 60s); el evento SSE real de tool-call es top-level `type: "tool-call"` (no anidado en otro envelope) con `payload.toolName` y `payload.args` ya parseado como objeto completo — un observador solo necesita reaccionar a ese `type` y leer `payload.args`; los eventos previos por `toolCallId` (`tool-call-input-streaming-start` → `tool-call-delta` con `payload.argsTextDelta` como string parcial → `tool-call-input-streaming-end`) se ignoran, y no hay que confundir el evento real con el `type: "tool-<nombre>"` que aparece anidado dentro del `finish` (historial embebido de mensajes UI), que no es un evento top-level; no existe `POST /api/memory/threads/:threadId/messages` (ese path es GET-only) — el append real de mensajes es `POST /api/memory/save-messages?agentId=<id>` con `threadId`/`resourceId` **por mensaje** dentro del array, y el thread debe existir antes (`POST /api/memory/threads` primero) o tira 500 `"Thread ... not found"`; `memory.options.readOnly:true` en el body de `/api/agents/:id/stream` sí evita persistir mensajes, pero igual crea la fila del thread (vacía) como side-effect — no sirve como señal de "no tocó la DB"; el route moderno `/api/agents/:id/stream` (no el `-legacy`) resuelve la memoria SOLO desde `body.memory.{thread,resource}` — los campos de nivel superior `threadId`/`resourceId` del body se ignoran para persistencia (se usan en otros routes, como `generate-legacy`); un turno sin `memory` no persiste NADA aunque la llamada devuelva 200 (bug encontrado en vivo en Task 13 — `agent-service.ts` solo mandaba `memory` cuando `memoryReadOnly` era `true`; corregido para mandarlo siempre). Los agentes NO saben la fecha actual: sin el bloque volátil `<contexto_temporal>` (inyectado por request en los composers desde `common/contexto-temporal.ts`) resuelven "este año"/"hace dos semanas" con el prior de entrenamiento — bug real encontrado en E2E: un egreso "de este año" (2026) quedó registrado en el Caso como 2024.
- Gotcha (2026-07-20): los scripts CLI del frontend que importan libs con `import "server-only"` (p. ej. `feedback:pull`/`feedback:respond`) corren con `tsx --conditions=react-server` — esa condición hace resolver `server-only` a su no-op `empty.js` (mismo truco que el alias de `vitest.config.ts`); sin ella, el paquete tira al importarse en Node pelado.

## Comandos

Por definir al inicializar cada servicio. Convención objetivo:

- Backend: `pnpm dev` (mastra dev) · `pnpm test` · `pnpm lint` · `pnpm evals` · `pnpm ingest <archivo> --title "<título>" [--categoria laboral --subcategoria despido]`
- Frontend: `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test` (e2e) · `pnpm feedback:pull` · `pnpm feedback:respond`
