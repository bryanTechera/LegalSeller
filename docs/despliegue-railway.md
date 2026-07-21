# Despliegue en Railway

Guía operativa para desplegar LegalSeller en Railway con deploy continuo desde GitHub. El diseño y el plan viven en `docs/plans/2026-07-21-despliegue-railway-cd-github.md` y `docs/plans/2026-07-21-plan-despliegue-railway.md`.

## Topología

Un proyecto Railway (ambiente `production`) con tres servicios en red privada:

| Servicio | Root | Build | Notas |
|---|---|---|---|
| **Postgres (pgvector)** | — | Template pgvector del catálogo | Provee `DATABASE_URL` a los otros dos |
| **backend** (Mastra) | `backend/` | `backend/Dockerfile` | IPv6 `::` puerto `4112`, healthcheck `/api/agents` |
| **frontend** (Next.js) | `frontend/` | `frontend/Dockerfile` | Público; healthcheck `/api/health`; pre-deploy `prisma migrate deploy` |

El frontend alcanza al backend por la red interna: `http://backend.railway.internal:4112`.

## Config-as-code

Cada servicio trae su `railway.json` (build por Dockerfile, `restartPolicyType: ON_FAILURE`, healthcheck). El del frontend además corre `npx prisma migrate deploy` como **pre-deploy command**: aplica las migraciones Prisma y, con ellas, crea las extensiones `vector` y `pgcrypto` (la migración inicial las incluye). No hace falta un paso manual de `CREATE EXTENSION` siempre que el Postgres sea el template pgvector.

## Variables de entorno por servicio

🔒 = secreto: lo pega el usuario en el dashboard de Railway (no va al repo ni al chat).

### backend
| Var | Valor | |
|---|---|---|
| `DATABASE_URL` | referencia al Postgres (`${{Postgres.DATABASE_URL}}`) | |
| `AI_GATEWAY_API_KEY` | (Vercel AI Gateway) | 🔒 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | (embeddings) | 🔒 |
| `HOST` | `::` | |
| `PORT` | `4112` | |
| `LOG_LEVEL` | `info` | |

### frontend
| Var | Valor | |
|---|---|---|
| `DATABASE_URL` | referencia al Postgres (`${{Postgres.DATABASE_URL}}`) | |
| `MASTRA_BASE_URL` | `http://backend.railway.internal:4112` | |
| `LOG_LEVEL` | `info` | |
| `REVISION_CLAVE` | clave del modo `/revision` (opcional; sin ella responde 503) | 🔒 |
| `PRISMA_CONNECTION_LIMIT` | opcional (default 10) | |
| `NEXT_PUBLIC_APP_VERSION` | opcional (default `dev`) | |
| `PORT` | lo inyecta Railway (no setear) | |

## Deploy continuo con GitHub

Cada servicio (backend, frontend) se conecta al repo `bryanTechera/LegalSeller`, rama `main`, con su root directory (`backend/`, `frontend/`). Railway redeploya en cada push a `main`. No requiere GitHub Actions: el CD es nativo.

Conexión (dashboard): servicio → Settings → Source → Connect Repo → seleccionar `bryanTechera/LegalSeller`, root directory del servicio, branch `main`.

## Checklist de puesta en marcha

1. Crear proyecto `legalseller` (ambiente `production`).
2. Deployar el template Postgres pgvector.
3. Servicio `backend`: conectar repo (root `backend`), setear vars no-sensibles + `DATABASE_URL` (referencia). Pegar los 🔒.
4. Servicio `frontend`: conectar repo (root `frontend`), setear vars no-sensibles + `MASTRA_BASE_URL` + `DATABASE_URL` (referencia). Pegar `REVISION_CLAVE` 🔒 si se quiere el modo revisión. Generar dominio público.
5. Verificar:
   - Frontend: el pre-deploy aplicó migraciones sin error (logs).
   - Extensiones: `SELECT extname FROM pg_extension WHERE extname IN ('vector','pgcrypto');` devuelve dos filas.
   - Backend: healthy en `/api/agents`. Frontend: healthy en `/api/health` y carga el home.
   - Frontend alcanza el backend por la red interna (una consulta dispara el stream del agente).
6. Prueba de CD: push trivial a `main` → Railway dispara un deploy automático.

## Corpus legal (paso operativo posterior)

El deploy no incluye ingesta del corpus. Cargar documentos con `pnpm ingest` (backend) apuntando a la DB de producción cuando corresponda.
