# LegalSeller

MVP: agentes de IA conectados a un RAG sobre documentos legales que responden preguntas con fuentes citadas.

## Estructura

- `backend/` — servicio de agentes (Mastra + TypeScript). Agentes, tools, ingesta RAG (chunking → embeddings → pgvector).
- `frontend/` — Next.js (App Router). UI + BFF: Prisma (dueño del schema), validaciones Zod y proxy SSE al backend.
- `docs/` — guías de arquitectura, codificación y lineamientos (fuente de verdad junto con `CLAUDE.md`).

## Requisitos

- Node.js >= 22.13
- pnpm (via corepack: `corepack enable pnpm`)
- PostgreSQL con extensiones `vector` (pgvector) y `pgcrypto`

## Quick start

```bash
# 1. Base de datos (una vez)
createdb legalseller
psql legalseller -c 'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;'

# 2. Backend de agentes
cd backend
cp .env.example .env   # completar claves
pnpm install
pnpm dev               # server Mastra en http://localhost:4112

# 3. Frontend
cd ../frontend
cp .env.example .env   # completar DATABASE_URL
pnpm install
pnpm prisma:migrate    # primera migración
pnpm dev               # http://localhost:3000
```

## Comandos

| Servicio | Comando | Descripción |
|---|---|---|
| backend | `pnpm dev` / `pnpm build` / `pnpm start` | Server de Mastra |
| backend | `pnpm test` / `pnpm lint` | Vitest / ESLint (señal de calidad; `tsc` no se usa como gate) |
| backend | `pnpm evals` | Evals LLM-as-judge (pendiente de implementar) |
| frontend | `pnpm dev` / `pnpm build` | Next.js |
| frontend | `pnpm typecheck` / `pnpm lint` | Gates de calidad |
| frontend | `pnpm test:unit` / `pnpm test` | Vitest / Playwright |

## Documentación

Leer primero `CLAUDE.md` (reglas críticas) y luego:

- `docs/lineamientos-generales.md`
- `docs/guia-arquitectura.md`
- `docs/guia-codificacion-backend.md`
- `docs/guia-codificacion-frontend.md`

## Estado del MVP

- [x] Guías y convenciones
- [x] Estructura backend (agente `consultas`, tool `buscar-documentos`, ingesta con chunking)
- [x] Estructura frontend (layout, tokens, BFF con proxy SSE, Prisma schema)
- [ ] Autenticación (Auth.js v5) — el proxy de chat usa un placeholder `DEV_USER_ID`
- [ ] Subida de documentos + pipeline de ingesta end-to-end
- [ ] UI de chat con streaming
- [ ] Evals con datasets gated (fidelidad de citas, corrección, compliance)
