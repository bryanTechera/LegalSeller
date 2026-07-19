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

### 2.1 Una instancia, ruteo por clasificación persistida

- Una sola instancia `new Mastra({...})` en `src/mastra/index.ts` registra agentes, workflows, storage, logger, observabilidad y server.
- **El ruteo entre agentes principales vive en el BFF, no en el frontend ni en un supervisor Mastra**: lee `Conversation.categoria` (Prisma) y, si ya está asignada, llama directo `POST /api/agents/{categoria}/stream`. Sin categoría todavía, corre el **agente receptor global** (`recepcion`, memoria `readOnly` — no persiste nada) que clasifica con la tool `asignar-clasificacion` y, con confianza alta, encadena en el mismo turno HTTP al agente de categoría (fast-path, ver §3.2). Modelo completo en el spec `docs/plans/2026-07-19-arquitectura-agentes-clasificacion.md`.
- **El mapa de agentes lo define `backend/src/mastra/dominios/registry.ts`** (fuente única de la taxonomía del dominio, ver `docs/dominio-consultas.md`): una categoría habilitada = un agente principal FE-invisible, dueño de la conversación y del funnel de venta completo; más el receptor global, único y compartido por todas las categorías. Habilitar una categoría o subcategoría es agregar su carpeta bajo `dominios/` + su entrada en el registry, sin tocar los agentes existentes.
- El registry se expone al BFF vía ruta custom **`GET /dominios`** (`server.apiRoutes`) — no `/api/dominios`: Mastra reserva el prefijo `/api` para sus rutas built-in y rechaza cualquier `apiRoutes` que empiece así (`Error: ... must not start with "/api"` al boot). El BFF la consume server-side desde `frontend/src/lib/dominios.ts`, con cache en memoria TTL 60s — nunca el browser.
- En v1 solo Laboral está habilitada (una categoría, una subcategoría: Despido): el registry cortocircuita el nivel con una sola opción habilitada (aquí, la subcategoría) y el BFF la auto-asigna sin correr agente clasificatorio (spec §5, §10) — ningún usuario on-topic ve una pregunta de clasificación.

### 2.2 Agente de categoría: retrieval directo, jerarquía Networks como evolución opcional

- v1 **no tiene jerarquía agente → sub-agente**: el agente de categoría (ej. `laboral`) llama directo la tool `buscar-documentos`, filtrada por `categoria`/`subcategorias` (WHERE sobre pgvector, ver §2.3 y `backend/src/mastra/tools/documentos/buscar-documentos-tool.ts`), y compone la respuesta con citas él mismo. No hay delegación Networks (`agents: {...}`) ni contrato de salida XML intermedio.
- **Sub-agentes Networks quedan como evolución opcional**, no como paso obligado de escalado: se promueven solo cuando las evals muestren que el prompt del agente de categoría degrada al discriminar entre subcategorías de su área (spec §4, §9 — golden set + threshold de precisión). Mientras el agente único discrimine bien, un sub-agente es complejidad sin beneficio medido.
- **Subcategoría es dato acumulativo del caso** (`Caso.subcategorias`, array — nunca estado de ruteo): el agente de categoría la determina conversando, o la recibe ya asignada del receptor en el fast-path, y la persiste vía `registrar-caso`. Parametriza el filtro de retrieval; nunca bloquea ni deriva a otro agente.
- Los agentes (categoría y receptor) se crean con la factory `crearAgente` (`backend/src/mastra/common/crear-agente.ts`), que hornea una sola vez los gotchas de Mastra v1: `maxSteps` en `defaultOptions`, `temperature: 1` explícito, `providerOptions.gateway.order` fijo, y el null-guard asimétrico de `instructions` dinámicas (sin request context al boot/listing → instructions vacías; con request real, un prompt roto debe re-lanzar, nunca correr en silencio).
- Las tools con efectos (`registrar-caso`, `corregir-clasificacion`) viven en el agente de categoría; el receptor global solo tiene `asignar-clasificacion` y `registrar-caso` (para captar contacto en el camino fuera-de-cobertura, que en v1 es su trabajo real — spec §10).

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
- Chat por streaming: el route handler (`app/api/chat/stream/route.ts`) no hace un pipe literal — delega en `lib/chat-orchestrator.ts`, que decide a qué agente llamar (ruteo por clasificación persistida, §2.1) y observa el stream mientras lo reenvía al browser:
  - Un `ReadableStream` propio intercepta cada evento SSE upstream: lo reenvía tal cual al cliente y en paralelo lo parsea con `frontend/src/utils/sse.ts` (parser tolerante a variantes de formato — gotchas en CLAUDE.md) para detectar tool-calls de interés (`asignar-clasificacion`, `registrar-caso`, `corregir-clasificacion`).
  - Cada tool-call observado se valida con su schema Zod (`lib/chat-orchestrator-schemas.ts`) antes de persistir; un payload que no matchea se loguea y se descarta — nunca rompe el stream que ve el usuario.
  - **Encadenamiento same-turn (fast-path)**: si el receptor clasifica con confianza (tool-call sin turno de pregunta), el BFF persiste la clasificación y llama al agente de categoría dentro de la **misma respuesta HTTP**, empalmando el segundo stream sobre el mismo `ReadableStream` de salida. El usuario ve un solo turno visible: pregunta → respuesta con citas.
  - **Slow-path**: si el receptor solo pregunta, su turno corrió con memoria `readOnly` (no persistió nada) y el BFF re-persiste el intercambio a mano con `POST /api/memory/save-messages?agentId=recepcion` (`threadId`/`resourceId` van por mensaje dentro del array, no como campo hermano) — no existe un `POST /api/memory/threads/:id/messages` para appendear. El thread ya existe porque la llamada `readOnly` al receptor lo crea como side-effect (aunque quede vacía de mensajes).
  - **Consumo desacoplado del abort del cliente**: el stream upstream se drena siempre hasta el final, incluso si el browser se desconecta — así una tool-call ya ejecutada por el agente se observa y persiste igual (spec §7, endurecimiento #1). Si el `enqueue` al cliente falla porque se fue, se ignora y se sigue drenando para no perder la persistencia.
  - **Sin reconciliación adicional** (spec §7, endurecimiento #2 quedó innecesario por diseño): como el receptor corre siempre `readOnly` y no persiste nada, no existe la clase de divergencia que ese endurecimiento buscaba resolver. Si el BFF muere antes de persistir una clasificación observada, el próximo mensaje del usuario vuelve a correr el receptor — que es idempotente — sin dejar estado a medio persistir que reconciliar.
- El body de cada llamada a `/api/agents/{agente}/stream` lleva **siempre** `memory: { thread, resource }` explícito (con `options.readOnly` solo cuando corresponde) — el endpoint moderno resuelve la persistencia solo desde ahí; los campos `threadId`/`resourceId` de nivel superior se ignoran para ese fin (gotcha detallado en CLAUDE.md).
- Threads con creación lazy, scoped al recurso de negocio que corresponda (en v1: un thread por sesión anónima, compartido entre el receptor y el agente de categoría).

### 3.3 Estado y datos en el cliente

- **SWR** para todo data fetching cliente (nunca hooks de fetch custom): config global con retry consciente de status (respeta 429/Retry-After, backoff en 5xx, sin retry en 401/403/404).
- **Zustand** para estado cliente: un store por dominio, selectores atómicos, `persist` parcial en sessionStorage. Separar estado persistente de intención UX transitoria (esta última en `useState` local).

### 3.4 Identidad

**v1 (actual): sin registro ni login.** El chat vive directamente en la home. La identidad es una cookie de sesión anónima HttpOnly (`ls_session`, UUID) que el BFF crea en el primer mensaje; ese id es el `resourceId` de Mastra y la clave de aislamiento de la conversación (`threadId = "chat-" + sessionId`, una conversación por sesión). Decisión registrada en `docs/plans/2026-07-19-v1-chat-publico-sin-auth.md`.

**Rate limiting (implementado)**: `frontend/src/lib/rate-limit.ts` mantiene dos ventanas deslizantes en memoria de proceso (v1: una sola instancia de FE) — por **sesión** (10 mensajes/min) y por **IP** (30 mensajes/min, más laxa porque varios usuarios legítimos pueden compartir una IP) — ambas chequeadas en `app/api/chat/stream/route.ts` antes de rutear el turno. Al superar cualquiera de las dos, `429` con header `Retry-After`. El mapa de contadores es acotado: por encima de un umbral (`SWEEP_THRESHOLD`) de claves activas dispara un barrido de entradas expiradas, para que un atacante rotando sesión/IP no lo haga crecer sin límite. Limpiar la cookie de sesión solo resetea el bucket de sesión — el de IP sigue conteniendo al abusador.

**Evolución:** Auth.js v5 (next-auth beta) con estrategia JWT y adapter Prisma; `proxy.ts` (middleware de Next 16) solo verificando logged-in/out, con la autorización fina repetida en server components y route handlers (defensa en profundidad). El patrón completo está en la guía de codificación frontend §10.

## 4. Modelo de datos

- Prisma como dueño del schema y las migraciones. Convenciones: PKs `String @default(cuid())`, `createdAt`/`updatedAt` en todo modelo, relaciones con `onDelete: Cascade`, índices compuestos orientados a las queries reales, `@@unique` para invariantes de negocio.
- Ownership en el modelo: todo recurso perteneciente a una identidad (usuario o sesión anónima) lleva su identificador y **toda query lo incluye en el `where`**. En v1 el corpus de documentos es global (sin ownership) y las conversaciones se aíslan por `sessionId`.
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
