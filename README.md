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
# 1. Base de datos (una vez; las extensiones las crea la migración de Prisma)
docker run -d --name legalseller-pg --restart unless-stopped \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=legalseller \
  -p 5432:5432 -v legalseller-pgdata:/var/lib/postgresql/data \
  pgvector/pgvector:pg17

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
| backend | `pnpm ingest <archivo.txt> --title "<título>"` | Ingesta un documento al corpus RAG (re-ejecutable; fuentes en `backend/corpus/`) |
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

v1 es pública: sin registro ni login, el chat vive directamente en el home. La identidad es una cookie de sesión anónima (ver `docs/plans/2026-07-19-v1-chat-publico-sin-auth.md`).

- [x] Guías y convenciones
- [x] Estructura backend (agente `consultas`, tool `buscar-documentos`, ingesta con chunking)
- [x] Estructura frontend (layout, tokens, BFF con proxy SSE, Prisma schema)
- [x] Chat en el home con streaming y sesión anónima
- [x] Pipeline de ingesta end-to-end (`pnpm ingest`; corpus inicial: Ley N° 17.250 de consumo, Uruguay)
- [ ] Rate limiting por sesión/IP en `/api/chat/stream` (requerido antes de exponer a tráfico real)
- [ ] Subida de documentos vía UI/admin (hoy la ingesta es por CLI)
- [ ] Evals con datasets gated (fidelidad de citas, corrección, compliance)
- [ ] Auth.js v5 (fase posterior, patrón documentado en la guía frontend §10)
