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
| `docs/dominio-consultas.md` | Taxonomía de categorías de consulta y roadmap — define agentes/sub-agentes y división de responsabilidades. **v1: solo Laboral → Despido** |
| `docs/guia-codificacion-backend.md` | Patrones Mastra: agentes, tools, prompting, evals, gotchas |
| `docs/guia-codificacion-frontend.md` | Patrones Next.js: RSC, route handlers, SWR/Zustand, testing |
| `docs/plans/` | Specs y planes de implementación fechados (registro de decisiones) |

Ante conflicto entre reglas, seguir la más estricta.

## Reglas críticas

- **NUNCA** `any` — `unknown` + Zod. Contratos siempre como schema Zod, tipos con `z.infer`.
- **NUNCA** `console.log` en código de producción — logger estructurado.
- **NUNCA** push directo a `main`/`develop`; conventional commits; lint + tests antes de commit.
- **NUNCA** una tool de agente tira una excepción en `execute` — degradación graceful `{ status: "error", mensaje }`.
- **NUNCA** el browser habla directo con el backend Mastra o la DB — todo pasa por el BFF.
- **SIEMPRE** aislar recursos por identidad en las queries (en v1: `sessionId` de la cookie anónima; con auth futura: `userId`). Verificación siempre server-side.
- **SIEMPRE** citar la fuente en respuestas de agentes basadas en el corpus legal.
- **SIEMPRE** imports por subpath de Mastra (`@mastra/core/agent`), nunca el barrel.
- **SIEMPRE** ante ambigüedad de dominio legal (no técnica) — qué debe responder un agente, criterios/plazos legales, alcance del corpus — no asumir ni inventar: la duda se deriva al **equipo de expertos legales** que asiste al equipo técnico. Formular la pregunta concreta, dejarla registrada (plan en `docs/plans/` o TODO) y seguir con lo no ambiguo (`docs/lineamientos-generales.md` §3.13).
- Naming: código inglés camelCase; IDs Mastra y archivos kebab-case español; prosa user/agent-facing en español; tags XML de prompts en español.
- Gotchas de Mastra heredados de producción en `docs/guia-codificacion-backend.md` §3 (`maxSteps` en `defaultOptions`, `temperature: 1` explícito con gateway+Gemini, `keepAlive: true` en el pool, `MASTRA_DISABLE_STORAGE_INIT` en tests). Al descubrir un gotcha nuevo, documentarlo acá o en la guía correspondiente en el momento.
- Gotchas propios descubiertos en vivo (2026-07-19): `PostgresStore` requiere `id` no vacío desde `@mastra/pg` 1.16; el stream nativo de Mastra (`POST /api/agents/:id/stream`) emite eventos con el texto anidado en `payload.text` (no el formato AI SDK top-level) — el parser en `frontend/src/utils/sse.ts` acepta ambos; `PostgresStore` va con `schemaName: "mastra"` porque si crea sus tablas en `public`, `prisma migrate dev` las detecta como drift y propone resetear la base; `backend/vitest.config.ts` necesita también `GOOGLE_GENERATIVE_AI_API_KEY` no-op en `env` de test (`config/embedding.ts` tira excepción al importarse sin la key, no solo al usarla); `@typescript-eslint/restrict-template-expressions` rechaza `number` en template literals — placeholders SQL dinámicos (`$${n}`) van con `String(n)`.

## Comandos

Por definir al inicializar cada servicio. Convención objetivo:

- Backend: `pnpm dev` (mastra dev) · `pnpm test` · `pnpm lint` · `pnpm evals` · `pnpm ingest <archivo> --title "<título>" [--categoria laboral --subcategoria despido]`
- Frontend: `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test` (e2e)
