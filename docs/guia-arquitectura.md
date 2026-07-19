# Guía de arquitectura — LegalSeller

Arquitectura del MVP: varios agentes de IA conectados a un RAG sobre documentos legales, respondiendo preguntas de usuarios. Replica la arquitectura de dos servicios que funcionó en producción en los proyectos previos, adaptada a este dominio.

## 1. Visión general

Dos servicios desplegados por separado + una base de datos compartida:

```
┌─────────────────────┐         ┌──────────────────────────┐
│  frontend/           │  HTTP   │  backend/                 │
│  Next.js (App Router)│ ──────► │  Mastra server            │
│  UI + BFF (Prisma)   │  SSE    │  Agentes + tools + RAG    │
└─────────┬───────────┘         └────────────┬─────────────┘
          │                                   │
          └───────────► PostgreSQL ◄──────────┘
                        (+ pgvector)
```

- **`backend/`**: servicio Mastra puro. Expone los agentes por el server nativo de Mastra (`mastra dev` / `mastra build`), sin framework HTTP propio. Rutas custom solo vía `server.apiRoutes`.
- **`frontend/`**: Next.js que sirve la UI **y** actúa como BFF: auth, acceso a datos propios vía Prisma, y proxy hacia el backend de agentes. El browser nunca habla directo con el backend Mastra ni con la base de datos.
- **PostgreSQL compartida** con extensión pgvector: Prisma la administra desde el frontend (migraciones, modelos de negocio); el backend la consume con un `pg.Pool` directo (storage de Mastra + queries vectoriales).

Razones (validadas en producción): separar el ciclo de deploy del agente del de la UI, permitir que el FE escale independiente, y mantener un único origen de datos sin sincronización entre bases.

## 2. Backend de agentes (Mastra)

### 2.1 Una instancia, agentes de identidad fija

- Una sola instancia `new Mastra({...})` en `src/mastra/index.ts` registra agentes, workflows, storage, logger, observabilidad y server.
- **El frontend elige el agente** según el contexto de UI y llama `POST /api/agents/{nombre}/stream`. El backend no deriva identidad ni rutea entre agentes principales.
- Pocos agentes principales (FE-facing) con identidad clara — para el MVP, por ejemplo: un agente de consultas generales y los especialistas que el dominio pida. Cada agente principal puede delegar en **sub-agentes expertos** vía el patrón Networks (`agents: {...}` en el constructor; Mastra auto-genera la tool de delegación).

### 2.2 Jerarquía agente → sub-agente

- Los sub-agentes son **especialistas de recuperación/generación** (ej.: experto en un corpus normativo específico). Devuelven datos estructurados en bloques XML (`<documentos_data>`, `<citas_data>`) dentro de un contrato de salida fijo; el supervisor extrae citas literales y compone la respuesta con su propia voz. Nunca relaya verbatim.
- Sub-agentes: sin working memory, `lastMessages` bajo, modelo más barato, `maxRetries` menor que el agente principal (patrón main=3 / sub=2).
- Las tools con efectos (mutaciones, aprobaciones) viven **solo en agentes principales** — los sub-agentes no pueden pausar streams.

### 2.3 RAG

Es el corazón del MVP. Pipeline en dos fases:

**Ingesta** (`services/document-registry/` en el backend, o job disparado desde el FE):
1. Extracción de texto del documento (pdf-parse / mammoth según formato).
2. **Chunking**: los documentos legales son largos; se trocean en chunks con overlap, guardando metadata (documento origen, sección/artículo, posición). *Nota: este es el componente nuevo respecto al proyecto anterior, que embeddeaba descripciones cortas sin chunking — diseñarlo explícitamente y testearlo con documentos reales del dominio.*
3. Embedding por chunk con `gemini-embedding-001` (vía `@google/genai`, helper único `generateEmbedding()` en `config/embedding.ts`).
4. Insert en tabla con columna `vector` (pgvector).

**Retrieval** (tool de agente):
- Tool `buscar-documentos` (u similar): embeddea la query y ejecuta SQL directo sobre pgvector con distancia coseno: `1 - (embedding <=> $1::vector) AS similarity`, filtro de similitud mínima (~0.3 como punto de partida, calibrar con evals), `ORDER BY embedding <=> $1::vector LIMIT n`.
- La respuesta de la tool incluye los chunks con su metadata de origen para que el agente **cite la fuente** (obligatorio en dominio legal).

Decisión heredada: **pgvector con SQL directo sobre un `pg.Pool` compartido**, sin vector store dedicado ni abstracciones RAG de Mastra. Es el enfoque probado; simple, sin dependencias extra y suficiente para el MVP. Si el MVP muestra necesidad de reranking o retrieval híbrido (keyword + vectorial), evaluarlo entonces con evals que lo justifiquen — no antes.

Complemento no vectorial: si aparece una fuente estructurada (catálogos, tablas normativas en JSON), el patrón probado es cargarla en memoria y consultarla con SQL in-memory (alasql) desde una tool dedicada, en lugar de embeddearla.

### 2.4 Datos por request vs memoria del agente

Dos canales con dueños distintos — no mezclarlos:

- **`RequestContext`**: estado sincronizado con el frontend, fresco en cada request (usuario, contexto de la consulta, permisos/integraciones). El FE lo manda en el body y Mastra lo auto-mergea; el backend solo define helpers tipados de lectura (`getReadOnlyFromContext()`, etc.). Nunca guardar este estado en working memory.
- **Working Memory**: propiedad del agente — preferencias y decisiones acumuladas por thread, en Markdown con `template:` (no schema JSON). Solo agentes principales.

### 2.5 Storage y conexión a Postgres

- **Un único `pg.Pool`** compartido entre el `PostgresStore` de Mastra y las queries crudas de las tools, con `keepAlive: true` (crítico detrás del proxy TCP de Railway). Exponer con `getPool()`.
- Inicializaciones de tablas propias: idempotentes, a nivel módulo, con `.catch()` que loguea sin tirar el proceso.

### 2.6 Prompts

Instrucciones dinámicas ensambladas por stages en orden **cache-friendly**: contexto estable primero (rol, reglas, contexto del usuario), contenido volátil al final. Separación estricta entre **rules** (restricciones de comportamiento: "NUNCA/SIEMPRE") y **skills** (conocimiento del dominio: heurísticas, criterios). Detalle en la guía de codificación backend §7.

## 3. Frontend (Next.js)

### 3.1 Capas

- **Server Components por defecto**; `'use client'` solo en hojas interactivas. Páginas y layouts son server: hacen `auth()`, consultan Prisma directo y redirigen.
- **Route Handlers** (`app/api/*`) para la API que consume el cliente vía SWR. Patrón fijo: auth → validación Zod del body → verificación de ownership → lógica (en `lib/`) → `NextResponse.json`.
- **`lib/` es la capa de dominio**: módulos por área de negocio con funciones puras/servicios. Los route handlers y server actions son delgados y delegan ahí.
- **El cliente nunca toca la DB**: SWR contra `/api/*`; Prisma es `server-only` con singleton en `globalThis`.

### 3.2 Integración con el backend de agentes

- Un único módulo (`lib/agent-service.ts`) conoce `MASTRA_BASE_URL`. Nada más importa esa env.
- Chat por streaming: route handler del FE actúa de **proxy SSE** hacia `POST /api/agents/{agente}/stream`, agregando auth y `requestContext` (threadId, resourceId=userId, contexto de la consulta). Cliente con `@mastra/client-js` o hook propio sobre el proxy.
- Threads con creación lazy, scoped al recurso de negocio que corresponda (en el MVP: por usuario o por conversación).

### 3.3 Estado y datos en el cliente

- **SWR** para todo data fetching cliente (nunca hooks de fetch custom): config global con retry consciente de status (respeta 429/Retry-After, backoff en 5xx, sin retry en 401/403/404).
- **Zustand** para estado cliente: un store por dominio, selectores atómicos, `persist` parcial en sessionStorage. Separar estado persistente de intención UX transitoria (esta última en `useState` local).

### 3.4 Auth

Auth.js v5 (next-auth beta) con estrategia JWT, adapter Prisma. `proxy.ts` (middleware de Next 16) solo verifica logged-in/out y redirige; la autorización fina se repite en server components y route handlers (defensa en profundidad).

## 4. Modelo de datos

- Prisma como dueño del schema y las migraciones. Convenciones: PKs `String @default(cuid())`, `createdAt`/`updatedAt` en todo modelo, relaciones con `onDelete: Cascade`, índices compuestos orientados a las queries reales, `@@unique` para invariantes de negocio.
- Ownership en el modelo: todo recurso de usuario lleva `userId` y **toda query lo incluye en el `where`**.
- Columnas vectoriales como `Unsupported("vector(N)")` en Prisma; las lee/escribe el backend por SQL directo. La dimensión N depende del modelo de embeddings elegido — fijarla en un solo lugar.
- Validación de IDs en APIs: `z.string().min(1)` + query con ownership (no asumir formato cuid/uuid).

## 5. Observabilidad

- Logs estructurados JSON a stdout (Railway los recolecta). Backend: `PinoLogger` de `@mastra/loggers` vía factory `makeLogger()`. Frontend: logger propio con redacción de PII (password/token/secret/authorization/cookie).
- Backend: `Observability` de Mastra con `SensitiveDataFilter` y `requestContextKeys` para correlación (threadId, resourceId).
- Frontend: `trackError()` como único entrypoint de reporte de errores; correlación con AsyncLocalStorage (`withLogContext`).

## 6. Deployment

- **Railway**, un servicio por carpeta + Postgres linkeado (provee `DATABASE_URL` a ambos).
- Backend: Docker multi-stage (`builder` → `production` con usuario no-root, `dumb-init`, `pnpm install --prod --frozen-lockfile`), `HOST=::` (IPv6 para red interna de Railway), healthcheck a `GET /api/agents`.
- Frontend: build de Next estándar; `instrumentation.ts` valida env al arranque y registra graceful shutdown (SIGTERM con deadline).
- Ramas → ambientes: `develop` → preprod, `main` → prod. `restartPolicyType: ON_FAILURE`.

## 7. Qué NO heredar de los proyectos anteriores

Para evitar copiar complejidad de otro dominio:

- Modelo de créditos/billing en microdólares y arquitectura dual de pagos — fuera del MVP.
- HITL con confirmación de mutaciones — el MVP responde preguntas; no hay mutaciones que aprobar. Si aparecen, revisar los gotchas documentados antes de usar `suspend()` (race condition conocida con parallel tool calls; el patrón probado es `requireApproval: true` o validación dentro de `execute`).
- Sistema de diseño "cálido/pedagógico" y target 1366×768 — LegalSeller define identidad visual propia (dominio legal: sobria, alta legibilidad), manteniendo la base técnica (CSS Modules + design tokens).
