# Plan de implementación — Despliegue en Railway con CD desde GitHub

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desplegar LegalSeller (backend Mastra + frontend Next.js + Postgres pgvector) en Railway con deploy continuo nativo disparado por push a `main`.

**Architecture:** Un proyecto Railway (ambiente `production`) con tres servicios en red privada: Postgres (template pgvector), backend (Dockerfile existente, IPv6 :4112) y frontend (Dockerfile nuevo, Next standalone). Las migraciones Prisma corren como pre-deploy command del frontend y crean también las extensiones `vector`/`pgcrypto`. El código se prepara en el repo; el provisioning se hace vía el MCP oficial de Railway.

**Tech Stack:** Railway, Docker multi-stage, Next.js 15 (standalone), Prisma 6, pnpm 9, Node 24, pgvector.

**Spec de referencia:** `docs/plans/2026-07-21-despliegue-railway-cd-github.md`

## Global Constraints

- **Node**: imágenes `node:24-alpine` (igual que `backend/Dockerfile`); `engines.node >=22.13.0`.
- **Package manager**: `pnpm@9.15.9` vía `corepack enable pnpm`; `--frozen-lockfile`.
- **Prisma**: `prisma` (CLI) está en devDependencies; `@prisma/client` en dependencies. El runtime del frontend debe incluir el CLI + engines + `prisma/` (schema y migraciones) para correr `prisma migrate deploy`.
- **Naming**: código inglés camelCase; archivos/config kebab-case; prosa en español rioplatense.
- **No secretos en el repo ni en el chat**: los 🔒 los pega el usuario en el dashboard de Railway.
- **Reglas del repo**: nunca push directo a `main`; conventional commits; correr lint/tests antes de commit cuando aplique.
- **Backend intacto**: no se modifica el código del backend; su `Dockerfile` ya está listo para Railway.

---

## PARTE A — Cambios de código en el repo (sin MCP; se puede hacer ya)

Rama: `chore/despliegue-railway` (ya creada, con el spec commiteado).

### Task 1: Frontend — output standalone + Dockerfile + .dockerignore

**Files:**
- Modify: `frontend/next.config.ts`
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`

**Interfaces:**
- Produces: imagen Docker del frontend que expone `node server.js` (Next standalone) escuchando en `PORT`, con `prisma` CLI disponible en `node_modules/.bin/prisma` y `prisma/migrations/` presentes para el pre-deploy.

- [ ] **Step 1: Confirmar que el frontend tiene su propio lockfile**

Run: `ls frontend/pnpm-lock.yaml`
Expected: el archivo existe (cada servicio es un proyecto pnpm independiente, sin workspace root). Si no existe, generarlo con `cd frontend && pnpm install` antes de seguir.

- [ ] **Step 2: Agregar `output: "standalone"` a next.config.ts**

En `frontend/next.config.ts`, dentro del objeto `nextConfig`, agregar la línea `output: "standalone",` junto a `reactStrictMode`:

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  reactCompiler: true,
  serverExternalPackages: ["pino", "thread-stream"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};
```

- [ ] **Step 3: Crear `frontend/.dockerignore`**

```
node_modules
.next
.git
.env
.env.*
!.env.example
npm-debug.log
Dockerfile
.dockerignore
coverage
playwright-report
test-results
```

- [ ] **Step 4: Crear `frontend/Dockerfile`**

```dockerfile
# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate
RUN pnpm run build

# ── Production ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app

RUN apk add --no-cache dumb-init \
  && addgroup -g 1001 nodejs \
  && adduser -S -u 1001 -G nodejs nodejs

ENV NODE_ENV=production

# Next standalone (trae su propio node_modules mínimo con @prisma/client trazado).
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

# Prisma CLI + engines + schema + migraciones (para el pre-deploy `prisma migrate deploy`).
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

USER nodejs
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
```

- [ ] **Step 5: Buildear la imagen para verificar (docker disponible localmente)**

Run: `cd frontend && docker build -t legalseller-frontend:test .`
Expected: build termina OK (`naming to docker.io/library/legalseller-frontend:test done`). Si `next build` falla por `reactCompiler`/CSP, diagnosticar con systematic-debugging antes de seguir.

- [ ] **Step 6: Verificar que el CLI de Prisma quedó en la imagen**

Run: `docker run --rm --entrypoint sh legalseller-frontend:test -c "./node_modules/.bin/prisma --version"`
Expected: imprime versiones de `prisma` y engines (confirma que `migrate deploy` podrá correr en el pre-deploy).

- [ ] **Step 7: Commit**

```bash
git add frontend/next.config.ts frontend/Dockerfile frontend/.dockerignore
git commit -m "feat(deploy): Dockerfile del frontend (Next standalone) + output standalone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Config-as-code de Railway por servicio

**Files:**
- Create: `backend/railway.json`
- Create: `frontend/railway.json`

**Interfaces:**
- Consumes: los Dockerfile de cada servicio (backend existente, frontend de Task 1).
- Produces: settings de build/deploy versionados que Railway lee al conectar cada servicio con su root directory.

- [ ] **Step 1: Crear `backend/railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "healthcheckPath": "/api/agents",
    "healthcheckTimeout": 30
  }
}
```

- [ ] **Step 2: Crear `frontend/railway.json`**

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "preDeployCommand": "npx prisma migrate deploy"
  }
}
```

- [ ] **Step 3: Validar el JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('backend/railway.json','utf8')); JSON.parse(require('fs').readFileSync('frontend/railway.json','utf8')); console.log('ok')"`
Expected: imprime `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/railway.json frontend/railway.json
git commit -m "feat(deploy): config-as-code de Railway (restart ON_FAILURE, healthcheck, pre-deploy migrate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Documentación de deploy y checklist de variables

**Files:**
- Create: `docs/despliegue-railway.md`
- Modify: `backend/.env.example` (solo si falta algo; probablemente sin cambios)
- Modify: `frontend/.env.example` (solo si falta algo; probablemente sin cambios)

**Interfaces:**
- Produces: el checklist operativo (variables por servicio, pasos de conexión GitHub) que la Parte B ejecuta y que el usuario usa para pegar los secretos.

- [ ] **Step 1: Crear `docs/despliegue-railway.md`** con: topología, tabla de variables por servicio (marcando 🔒), pasos de conexión del repo a cada servicio (root `backend/` y `frontend/`, rama `main`), y el checklist de verificación post-deploy. Contenido derivado del spec `docs/plans/2026-07-21-despliegue-railway-cd-github.md` §4 y §6.

- [ ] **Step 2: Revisar que `.env.example` de ambos servicios liste todas las vars usadas en prod**

Run: `grep -RhoE "process\.env\.[A-Z_]+" frontend/src backend/src 2>/dev/null | sort -u`
Expected: cada var que aparezca debe estar documentada en el `.env.example` correspondiente. Agregar las que falten con comentario de propósito (regla `lineamientos-generales.md` §3: `.env.example` siempre actualizado).

- [ ] **Step 3: Commit**

```bash
git add docs/despliegue-railway.md backend/.env.example frontend/.env.example
git commit -m "docs(deploy): guía operativa de despliegue en Railway y checklist de variables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Merge de la Parte A a `main`

Merge a `main` = disparador del primer deploy real una vez que los servicios estén conectados (Parte B). Se puede hacer antes o después de la Parte B; si se hace antes, el primer deploy ocurre automáticamente al conectar cada servicio.

- [ ] **Step 1: Correr lint/tests que apliquen a lo tocado**

Run: `cd frontend && pnpm lint && pnpm typecheck`
Expected: sin errores (los cambios son config/Docker; no deberían romper lint/types).

- [ ] **Step 2: Abrir PR y mergear a `main`**

```bash
git push -u origin chore/despliegue-railway
gh pr create --base main --head chore/despliegue-railway \
  --title "feat(deploy): despliegue en Railway con CD desde GitHub" \
  --body "Prepara el repo para Railway: Dockerfile del frontend (standalone), config-as-code por servicio (restart ON_FAILURE, healthcheck, pre-deploy migrate), docs de deploy. Provisioning en Railway vía MCP. Ver docs/plans/2026-07-21-plan-despliegue-railway.md"
```

Esperar aprobación del usuario para mergear (no mergear autónomamente).

---

## PARTE B — Provisioning en Railway (requiere el MCP conectado)

**Precondición:** el usuario corrió `claude mcp add railway --transport http https://mcp.railway.com` en sesión interactiva y completó el OAuth. Las tools del MCP de Railway están disponibles vía ToolSearch.

> Nota: los nombres exactos de las tools del MCP se descubren en runtime (ToolSearch `railway`). Los pasos describen la operación; el ejecutor mapea cada uno a la tool correspondiente. Las acciones destructivas piden confirmación a nivel protocolo.

### Task 5: Proyecto + Postgres pgvector

- [ ] **Step 1:** Descubrir las tools del MCP: ToolSearch query `railway` (create-project, list/deploy template, set variables, etc.).
- [ ] **Step 2:** Crear el proyecto Railway (nombre `legalseller`), ambiente `production`.
- [ ] **Step 3:** Deployar el template **Postgres pgvector** en el proyecto.
- [ ] **Step 4 (verificación):** Confirmar que el servicio Postgres quedó `RUNNING` y que expone `DATABASE_URL`. Anotar el nombre del servicio Postgres (para la referencia `${{...}}`).

### Task 6: Servicio backend

**Interfaces:**
- Consumes: `DATABASE_URL` del Postgres (Task 5); `backend/railway.json` (Task 2); `backend/Dockerfile`.

- [ ] **Step 1:** Crear el servicio `backend` conectado al repo `bryanTechera/LegalSeller`, rama `main`, **root directory `backend`**. Si el MCP no permite conectar el repo, dejar el checklist para que el usuario lo haga en el dashboard (Settings → Source → Connect Repo → root `backend`, branch `main`).
- [ ] **Step 2:** Setear variables no-sensibles: `HOST=::`, `PORT=4112`, `LOG_LEVEL=info`, y `DATABASE_URL` como referencia al Postgres (`${{Postgres.DATABASE_URL}}` con el nombre real del servicio).
- [ ] **Step 3:** Dejar marcadas (sin valor) las 🔒 `AI_GATEWAY_API_KEY` y `GOOGLE_GENERATIVE_AI_API_KEY` para que las pegue el usuario.
- [ ] **Step 4 (verificación):** Tras el primer deploy + secretos, confirmar healthcheck OK en `/api/agents` (servicio `RUNNING`, healthy).

### Task 7: Servicio frontend

**Interfaces:**
- Consumes: `DATABASE_URL` del Postgres (Task 5); `MASTRA_BASE_URL` apuntando al backend (Task 6); `frontend/railway.json` con pre-deploy migrate (Task 2); `frontend/Dockerfile` (Task 1).

- [ ] **Step 1:** Crear el servicio `frontend` conectado al repo, rama `main`, **root directory `frontend`** (o checklist dashboard si el MCP no lo permite).
- [ ] **Step 2:** Setear variables no-sensibles: `MASTRA_BASE_URL=http://backend.railway.internal:4112`, `LOG_LEVEL=info`, `DATABASE_URL` como referencia al Postgres. `PORT` lo inyecta Railway (no setear).
- [ ] **Step 3:** Dejar marcada (sin valor) la 🔒 `REVISION_CLAVE` (opcional).
- [ ] **Step 4:** Generar el dominio público del frontend.
- [ ] **Step 5 (verificación):** Confirmar que el pre-deploy corrió `prisma migrate deploy` sin error (logs muestran migraciones aplicadas y extensiones creadas), y que el servicio quedó `RUNNING`.

### Task 8: Verificación end-to-end + prueba de CD

- [ ] **Step 1:** Abrir el dominio público del frontend; confirmar que carga el home (chat).
- [ ] **Step 2:** Confirmar por logs que el frontend alcanza el backend por `backend.railway.internal:4112` (una consulta de prueba dispara el stream del agente).
- [ ] **Step 3:** Verificar en la DB que las extensiones existen: correr (vía consola del Postgres o query) `SELECT extname FROM pg_extension WHERE extname IN ('vector','pgcrypto');` — Expected: dos filas.
- [ ] **Step 4 (prueba de CD):** Hacer un commit trivial en `main` (ej. bump de una línea en `docs/despliegue-railway.md`) y push; confirmar que Railway dispara automáticamente un nuevo deploy en backend y/o frontend. Esto valida el despliegue continuo con GitHub — el objetivo central del pedido.

---

## Self-Review (cobertura del spec)

- Topología 3 servicios → Tasks 5-7. ✔
- Postgres pgvector template → Task 5. ✔
- Backend Dockerfile existente (sin cambios) → Task 6 (solo config/conexión). ✔
- Frontend Dockerfile nuevo + standalone → Task 1. ✔
- Prisma CLI en runtime (devDep) → Task 1 Steps 4/6. ✔
- railway.json restart/healthcheck/pre-deploy → Task 2. ✔
- Variables por servicio (🔒 las pega el usuario) → Tasks 6/7 + doc Task 3. ✔
- CD por push a main → Tasks 6/7 (conexión repo) + Task 8 (prueba). ✔
- Migraciones = crean extensiones → Task 7 Step 5 + Task 8 Step 3. ✔
- Contingencia MCP sin conexión GitHub → Tasks 6/7 Step 1 (fallback dashboard). ✔
- Riesgo dimensión vector 3072 / índice → verificar en Task 7 Step 5 (que `migrate deploy` no falle). ✔

Sin placeholders TBD/TODO. Tipos/comandos consistentes entre tasks (`prisma migrate deploy`, `backend.railway.internal:4112`, roots `backend`/`frontend`).
