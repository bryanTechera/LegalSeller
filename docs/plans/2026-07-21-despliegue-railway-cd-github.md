# Despliegue en Railway con CD desde GitHub

**Fecha:** 2026-07-21
**Estado:** APROBADO (diseño) — pendiente de ejecución
**Rama:** `chore/despliegue-railway`

Spec para desplegar LegalSeller (monorepo backend Mastra + frontend Next.js + Postgres pgvector) en Railway, con despliegue continuo nativo disparado por push a `main` en GitHub (`bryanTechera/LegalSeller`).

Deriva de `docs/guia-arquitectura.md §6 Deployment`, que ya fija el modelo (un servicio por carpeta + Postgres linkeado, `restartPolicyType: ON_FAILURE`, backend en IPv6).

---

## 1. Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Acceso a la cuenta | **MCP oficial de Railway** (`claude mcp add railway --transport http https://mcp.railway.com`) | El usuario lo conecta en sesión interactiva (OAuth); el agente opera desde las tools del MCP |
| Ambientes | **Solo prod** (`main` → production) | MVP; hoy `main` es la única rama de larga vida (no existe `develop`). Preprod se agrega después sin re-trabajo |
| Build frontend | **Dockerfile nuevo** (Next standalone) | Control y reproducibilidad; simétrico al backend |
| Postgres | **Template pgvector de Railway** | El Postgres default no trae la shared lib de pgvector; el template sí |
| Secretos | **Los pega el usuario en el dashboard** | Cero exposición de secretos en el chat/logs; el agente setea solo las no-sensibles |

---

## 2. Topología

Un proyecto Railway, ambiente `production`, tres servicios en red privada interna:

1. **Postgres (pgvector)** — desde el template pgvector del catálogo. Expone `DATABASE_URL`, consumido por los otros dos vía referencia `${{Postgres.DATABASE_URL}}`.
2. **backend** (Mastra) — root `backend/`, build por su `Dockerfile` actual. Escucha en `::` (IPv6) puerto `4112`, healthcheck a `GET /api/agents`. Alcanzable internamente como `http://backend.railway.internal:4112`.
3. **frontend** (Next.js) — root `frontend/`, build por Dockerfile nuevo (standalone). Servicio público (dominio Railway). Habla al backend por la red interna.

```
GitHub main ──push──▶ Railway (auto-deploy)
                         ├─ backend  (Dockerfile, :4112, IPv6)  ─┐
                         ├─ frontend (Dockerfile, standalone)  ──┤ red interna
                         └─ Postgres (pgvector) ◀────────────────┘
                                    ▲
                              DATABASE_URL (ref)
```

---

## 3. Cambios de código (en el repo, antes de deployar)

Estos cambios se commitean en `chore/despliegue-railway` y se mergean a `main` (lo que dispara el primer deploy real).

1. **`frontend/next.config.ts`**: agregar `output: "standalone"`.
2. **`frontend/Dockerfile`** (nuevo): multi-stage simétrico al del backend.
   - *builder*: `node:24-alpine`, `corepack enable pnpm`, `pnpm install --frozen-lockfile`, `prisma generate`, `next build`.
   - *production*: usuario no-root + `dumb-init`; copia el output standalone (`.next/standalone`, `.next/static`, `public`) **más** lo necesario para migraciones: `prisma/schema.prisma`, `prisma/migrations/`, y el Prisma CLI + engines (para poder correr `prisma migrate deploy` en el pre-deploy).
   - `ENV NODE_ENV=production`, `EXPOSE`/`PORT` que inyecta Railway, `CMD ["node", "server.js"]`.
3. **`frontend/.dockerignore`** (nuevo): excluir `node_modules`, `.next`, `.env*`, `.git`, etc.
4. **Config Railway por servicio** (`railway.json` o `railway.toml` en cada carpeta):
   - backend: `restartPolicyType: ON_FAILURE`, healthcheck `/api/agents`.
   - frontend: `restartPolicyType: ON_FAILURE`, **pre-deploy command** = `npx prisma migrate deploy`.
5. **`docs/`**: documentar el deploy (README de deploy o sección en `guia-arquitectura.md`); actualizar `.env.example` si aparece alguna var nueva.

### Por qué el pre-deploy command para migraciones

`prisma migrate deploy` corre en el contexto de la imagen del frontend **antes** de cortar tráfico al deploy nuevo. La migración inicial (`prisma/migrations/20260719152649_init/migration.sql`) ya incluye `CREATE EXTENSION IF NOT EXISTS "vector"` y `"pgcrypto"`, así que ese mismo comando crea las extensiones — siempre que la imagen de Postgres (template pgvector) traiga la shared lib. No hace falta un paso manual de `CREATE EXTENSION`.

El backend y el frontend usan **schemas separados** en la misma base (`PostgresStore` de Mastra en `schemaName: "mastra"`, Prisma en `public`), así que el orden entre la migración del FE y el boot del backend no genera conflicto.

---

## 4. Variables de entorno

🔒 = secreto, lo pega el usuario en el dashboard. El resto las setea el agente vía MCP.

### backend
| Var | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia) |
| `AI_GATEWAY_API_KEY` | 🔒 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | 🔒 |
| `HOST` | `::` |
| `PORT` | `4112` |
| `LOG_LEVEL` | `info` |

### frontend
| Var | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia) |
| `MASTRA_BASE_URL` | `http://backend.railway.internal:4112` |
| `LOG_LEVEL` | `info` |
| `REVISION_CLAVE` | 🔒 (opcional; sin ella `/revision` responde 503) |
| `PRISMA_CONNECTION_LIMIT` | opcional (default 10) |
| `PORT` | lo inyecta Railway |

---

## 5. Deploy continuo con GitHub

Cada servicio (backend, frontend) se conecta al repo `bryanTechera/LegalSeller`, rama `main`, con su *root directory* respectivo (`backend/`, `frontend/`). Railway redeploya automáticamente en cada push a `main`. No requiere GitHub Actions ni YAML de CI: el CD es nativo de Railway.

**Contingencia:** si el MCP remoto no expone la conexión de repo GitHub como tool directa, esa conexión la hace el usuario en el dashboard (checklist provisto por el agente). Todo lo demás (proyecto, Postgres, env vars, settings, pre-deploy) lo hace el agente por el MCP.

---

## 6. Orden de ejecución (una vez conectado el MCP)

1. Crear proyecto Railway.
2. Deploy del template Postgres pgvector.
3. Servicio **backend**: conectar repo (root `backend/`), setear envs no-sensibles + referencia a `DATABASE_URL`.
4. Servicio **frontend**: conectar repo (root `frontend/`), setear envs no-sensibles + `MASTRA_BASE_URL` + pre-deploy `npx prisma migrate deploy`.
5. El usuario pega los secretos 🔒 en ambos servicios.
6. Verificar: migraciones aplicadas (extensiones creadas), backend `healthy` (`/api/agents`), frontend levanta y alcanza al backend por la red interna.
7. Push de prueba a `main` para confirmar el CD end-to-end.

---

## 7. Riesgos / a verificar en vivo

- **Dimensión del vector (3072).** `DocumentChunk.embedding` es `vector(3072)`. pgvector soporta columnas de esa dimensión; el índice HNSW/IVFFlat tiene tope de 2000 dims, pero el proyecto usa **SQL directo con distancia coseno sin índice ANN declarado** (`docs/guia-arquitectura.md §2.3`) — confirmar que no haya un índice que falle al crearse.
- **Capacidad del MCP remoto** para conectar repos GitHub (ver contingencia §5).
- **`next build` en el runner de Railway** con `reactCompiler: true` y la CSP estricta — que el build pase.
- **`keepAlive: true`** en el pool del backend ya está (crítico detrás del proxy TCP de Railway; `docs/guia-arquitectura.md §3`).

---

## 8. Fuera de alcance (por ahora)

- Ambiente preprod (`develop` → preprod). Se agrega después replicando servicios.
- Dominio custom (se usa el dominio `.railway.app` autogenerado del frontend).
- Ingesta del corpus legal en producción (`pnpm ingest`) — es un paso operativo posterior, no parte del setup de infra.
