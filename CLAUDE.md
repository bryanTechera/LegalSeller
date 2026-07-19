# LegalSeller

MVP: varios agentes de IA conectados a un RAG sobre documentos legales que responden preguntas de usuarios.

## Arquitectura

Monorepo con dos servicios + Postgres (pgvector) compartida:

- `backend/` — servicio Mastra (TypeScript, ES Modules): agentes, tools, RAG. Server nativo de Mastra.
- `frontend/` — Next.js (App Router): UI + BFF (Prisma, proxy SSE al backend de agentes). **v1 sin registro/login**: chat directo en el home, identidad por cookie de sesión anónima (Auth.js queda como evolución).

Detalle completo en `docs/guia-arquitectura.md`.

## Documentación (fuente de verdad)

| Documento | Contenido |
|---|---|
| `docs/lineamientos-generales.md` | Stack, idiomas/naming, principios, git workflow, env vars |
| `docs/guia-arquitectura.md` | Servicios, RAG, canales de datos, deployment |
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
- Naming: código inglés camelCase; IDs Mastra y archivos kebab-case español; prosa user/agent-facing en español; tags XML de prompts en español.
- Gotchas de Mastra heredados de producción en `docs/guia-codificacion-backend.md` §3 (`maxSteps` en `defaultOptions`, `temperature: 1` explícito con gateway+Gemini, `keepAlive: true` en el pool, `MASTRA_DISABLE_STORAGE_INIT` en tests). Al descubrir un gotcha nuevo, documentarlo acá o en la guía correspondiente en el momento.
- Gotchas propios descubiertos en vivo (2026-07-19): `PostgresStore` requiere `id` no vacío desde `@mastra/pg` 1.16; el stream nativo de Mastra (`POST /api/agents/:id/stream`) emite eventos con el texto anidado en `payload.text` (no el formato AI SDK top-level) — el parser en `frontend/src/utils/sse.ts` acepta ambos.

## Comandos

Por definir al inicializar cada servicio. Convención objetivo:

- Backend: `pnpm dev` (mastra dev) · `pnpm test` · `pnpm lint` · `pnpm evals`
- Frontend: `pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm test` (e2e)
