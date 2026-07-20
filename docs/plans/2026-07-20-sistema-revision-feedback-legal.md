# Sistema de revisión y feedback del equipo legal — diseño

> Spec de diseño validada el 2026-07-20. Define el sistema de mejora continua:
> el equipo de expertos legales crea sesiones de conversación de prueba, deja
> notas ancladas a mensajes, y el equipo dev responde vía un pipe IA-first con
> Claude Code al centro. Complementa `docs/vision-producto.md` (funnel) y
> `.claude/rules/eval-design.md` (metodología bottom-up que este sistema
> alimenta).

## 1. Problema y objetivo

Hoy existen dos canales entre el equipo dev y el equipo de expertos legales:

- **dev → legal**: preguntas enviables en `docs/preguntas-legales/`.
- **legal → dev (documentos)**: la skill `procesar-documento-legal`.

Falta el canal **legal → dev de feedback sobre comportamiento**: los expertos
prueban el sistema, detectan fallos (una cita inventada, una clasificación
errónea, una conversación que no capta) y no tienen dónde dejarlos de forma
que el equipo dev pueda diagnosticarlos y corregirlos con trazabilidad.

Este sistema cierra ese circuito. Además provee el insumo que la metodología
de `eval-design.md` ya exige y hoy no tiene mecanismo de recolección: **trazas
anotadas por el experto de dominio** (open coding del primer fallo upstream,
hecho por quien más sabe). Cada nota resuelta puede dejar un caso de eval como
artefacto anti-regresión.

## 2. Decisiones tomadas (validadas con el equipo)

| Decisión | Elección |
|---|---|
| Acceso del equipo legal | **Clave compartida simple** (env `REVISION_CLAVE`); sin login. El experto escribe su nombre al entrar y ese nombre firma sus notas. |
| Workspace | **Compartido**: todo el equipo legal ve todas las sesiones de revisión; cualquiera anota sobre cualquiera. |
| Enfoque | **A — Anotación embebida en la web app + skill de Claude Code**: UI de anotación para el equipo legal; el lado dev no tiene UI — el review lo hace Claude Code con scripts + skill. |
| Contexto para el review | El export incluye los **spans de Mastra** (tool calls con input/output, agente por turno, tokens) — no solo el transcript. Patrón de reconstrucción tomado del proyecto `observability` (colar). |

## 3. Arquitectura

Modo revisión como ruta nueva del frontend (`/revision`), reusando toda la
maquinaria existente: mismos agentes, mismo corpus, mismo
`orchestrateChatTurn`. El experto testea exactamente lo que ve un consultante,
incluida la captación. El backend Mastra solo cambia en una cosa: se habilita
el AI tracing (§6).

```
Equipo legal                    Equipo dev (sin UI)
    │                                │
    ▼                                ▼
/revision (UI anotación)        Claude Code
    │                                │  skill revisar-feedback-legal
    ▼                                ▼
BFF /api/revision/*             pnpm feedback:pull / feedback:respond
    │                                │  (Prisma directo, workspace frontend)
    ▼                                ▼
Postgres ── Conversation(esRevision) · NotaRevision · RespuestaNota
         ── mastra_messages · mastra_ai_spans (tracing nuevo)
```

### Acceso

- `POST /api/revision/acceso` con `{ clave, nombre }`: valida contra
  `REVISION_CLAVE` y setea cookie httpOnly `ls_experto` firmada con secreto del
  servidor. La firma incluye un hash de la clave: **rotar la clave revoca todas
  las cookies**.
- Todas las rutas `/api/revision/*` (salvo `acceso`) exigen cookie válida.

### Sesiones de revisión desacopladas de `ls_session`

Crear una sesión de revisión genera un `sessionId` fresco **server-side** (no
toca la cookie anónima `ls_session` del experto como consumidor). El chat de
revisión va por `POST /api/revision/sesiones/:id/mensajes`, que valida cookie
de experto + `esRevision` y delega en `orchestrateChatTurn` con ese
`sessionId`. Un experto puede tener N sesiones y volver a cualquiera — a
diferencia del home (una conversación por cookie).

### Transcript con IDs reales

`GET /api/revision/sesiones/:id` devuelve el transcript desde Mastra storage
(BFF → `GET /api/memory/threads/:threadId/messages`) + notas + respuestas. Las
notas se anclan al `messageId` **persistido** de Mastra, no a los IDs efímeros
del cliente. En modo revisión la UI refresca el transcript al cerrar cada
turno para anclar sobre IDs reales.

## 4. Modelo de datos (Prisma)

```prisma
model Conversation {
  // ... campos actuales ...
  esRevision Boolean @default(false)  // sesión creada por el equipo legal
  titulo     String?                  // nombre visible en el listado compartido
  notas      NotaRevision[]
}

/// Nota de revisión: anclada a un mensaje (messageId de Mastra) o a la
/// sesión entera (messageId null). citaTexto guarda el extracto anotado —
/// resiliencia si el anclaje falla y contexto para el export a markdown.
model NotaRevision {
  id             String          @id @default(cuid())
  conversationId String
  messageId      String?
  citaTexto      String?
  autor          String          // nombre del experto o "equipo-dev"
  texto          String
  estado         NotaEstado      @default(ABIERTA)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  conversation   Conversation    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  respuestas     RespuestaNota[]

  @@index([conversationId, estado])
}

/// Hilo de ida y vuelta por nota.
model RespuestaNota {
  id        String      @id @default(cuid())
  notaId    String
  origen    AutorOrigen // EXPERTO | DEV
  autor     String
  texto     String
  createdAt DateTime    @default(now())
  nota      NotaRevision @relation(fields: [notaId], references: [id], onDelete: Cascade)

  @@index([notaId, createdAt])
}

enum NotaEstado  { ABIERTA RESPONDIDA RESUELTA }
enum AutorOrigen { EXPERTO DEV }
```

**Máquina de estados — semántica "a quién le toca":**

- `ABIERTA` — pendiente del equipo dev (estado inicial de una nota de experto;
  también al que vuelve una nota cuando el experto contesta una `RESPONDIDA`).
- `RESPONDIDA` — pendiente del experto: el dev respondió (respuesta directa o
  pedido de aclaración — estructuralmente es lo mismo). Una nota **creada por
  el dev** (autor `equipo-dev`, ej. pedido de aclaración general) nace
  directamente en este estado.
- `RESUELTA` — cerrada. Cualquiera de los dos lados puede cerrar.

**Los `Caso` de sesiones de revisión no contaminan métricas**: se excluyen por
join (`conversation.esRevision = false`) en toda consulta de negocio y
back-office. No se bloquea su creación — que el agente registre el caso es
parte de lo que el experto testea.

## 5. Endpoints BFF (`/api/revision/*`)

| Endpoint | Función |
|---|---|
| `POST /acceso` | Valida clave compartida + nombre; setea cookie `ls_experto`. |
| `GET /sesiones` | Listado compartido: título, creador, última actividad, conteo de notas por estado. |
| `POST /sesiones` | Crea sesión de revisión (sessionId fresco, `esRevision`, título opcional). |
| `GET /sesiones/:id` | Transcript (proxy Mastra) + notas + respuestas. |
| `POST /sesiones/:id/mensajes` | Turno de chat (SSE, delega en `orchestrateChatTurn`). |
| `POST /sesiones/:id/notas` | Crea nota (anclada a `messageId` o general). |
| `POST /notas/:id/respuestas` | Respuesta del experto en el hilo (estado → `ABIERTA` si estaba `RESPONDIDA`). |
| `PATCH /notas/:id` | Transición de estado (marcar resuelta). |

Contratos como schema Zod (`z.infer`), verificación server-side de cookie y de
`esRevision` en cada ruta.

## 6. Tracing de Mastra (requisito nuevo)

Se habilita el AI tracing en el `new Mastra` del backend con el **exporter
default**, que persiste a `mastra_ai_spans` en el mismo Postgres (schema
`mastra`). Sin exporters externos ni servicios nuevos.

- Correlación span↔thread por `metadata->>'threadId'` (patrón verificado en el
  proyecto `observability` de colar, `src/app/api/observability/conversation/[threadId]/route.ts`).
- Span types relevantes: `agent_run` (qué agente atendió), `tool_call`
  (nombre, input, output, error; atribución al agente subiendo por
  `parentSpanId`), `model_generation` (modelo, tokens).
- La reconstrucción acá es más simple que en colar: sin sub-threads con
  sufijo ni supervisores — recepción y laboral corren sobre el mismo thread.

## 7. El pipe dev — Claude Code al centro

### Reconstructor de timeline

`frontend/src/lib/revision/timeline.ts` (compartido entre BFF y scripts):
dado un `threadId`, produce la sesión completa intercalada por timestamp:
turnos usuario/asistente con el agente que respondió, cada tool call con su
input/output íntegro (qué chunks devolvió `buscar-documentos`, qué payload
registró `registrar-caso`, qué clasificó `asignar-clasificacion`, errores),
tokens/modelo, y las notas del experto insertadas en su posición exacta.

Esto convierte el review en diagnóstico real: la nota "inventó el plazo"
queda al lado del span que muestra que `buscar-documentos` nunca devolvió ese
plazo.

### Scripts (workspace frontend, Prisma directo)

La regla "todo por el BFF" aplica al browser; el tooling server-side de dev
accede con Prisma directo.

- `pnpm feedback:pull` — sesiones de revisión con notas `ABIERTA`; escribe un
  markdown por sesión en `tmp/feedback-legal/` en la raíz del repo
  (**gitignoreado**): timeline completa con spans + notas en contexto +
  metadata (autor, estado, fechas).
- `pnpm feedback:respond` — publica `RespuestaNota` (origen `DEV`, autor
  `equipo-dev`) y transiciona estado (`ABIERTA→RESPONDIDA`, o `→RESUELTA` con
  flag). También puede crear una **nota nueva** de sesión (autor `equipo-dev`,
  nace en `RESPONDIDA`) para pedir aclaraciones no atadas a una nota
  existente. Escritura + transición en una transacción.

### Skill `revisar-feedback-legal` (`.claude/skills/`)

Prima de `procesar-documento-legal`. Fases:

1. **Pull** de sesiones anotadas (`pnpm feedback:pull`).
2. **Diagnóstico por nota** sobre la timeline completa: ¿el fallo fue prompt,
   retrieval, hueco del corpus, tool, bug de código? Open coding del primer
   fallo upstream (`eval-design.md`).
3. **Triage** → destino: rule / skill / RAG / eval / pregunta a
   `docs/preguntas-legales/` / bug. Reusa el árbol de decisión de
   `rules-and-skills-taxonomy.md`.
4. **Implementar el fix** — o redactar la pregunta enviable si la duda es de
   dominio legal (regla SIEMPRE de `CLAUDE.md`: no inventar criterios legales).
5. **Artefacto anti-regresión**: si la nota reveló un fallo de comportamiento,
   nace un caso de eval (golden set / scorer según corresponda).
6. **Responder al experto** (`pnpm feedback:respond`) — en lenguaje para
   abogados, sin jerga técnica; misma voz que `docs/preguntas-legales/`.
   Cuando el fix se despliega, la respuesta invita a re-testear el escenario.
7. **Resumen del ciclo**: qué se arregló, qué quedó preguntado, qué evals
   nuevos.

Lo versionado es lo que **resulta** del ciclo (fixes, evals, preguntas
legales); los markdown exportados son derivados y no se versionan.

## 8. UI del experto (`/revision`)

- Sin cookie válida: pantalla de acceso (clave + "tu nombre").
- Con cookie: **listado compartido** — título, creador, última actividad,
  badges de notas (abiertas / con respuesta nueva). Botón "Nueva sesión de
  revisión" (título opcional).
- Vista de sesión: chat que reusa `ChatPanel` (mismos estilos). Cada mensaje
  tiene la acción "Dejar nota" que abre el hilo de esa nota; las notas
  generales de sesión viven en un panel aparte. En el hilo el experto ve las
  respuestas del equipo dev, contesta (vuelve a `ABIERTA`) o marca resuelta.
- Tras cada turno, la UI refresca la sesión para anclar sobre `messageId`
  persistidos.

## 9. Errores y seguridad

- `/api/revision/*` sin cookie válida → 401. Sesión inexistente o sin
  `esRevision` → 404 (sin filtrar existencia).
- Mastra caído al traer transcript → 502 con mensaje de reintento.
- Rate limit: reusa `checkRateLimit` en el turno de chat de revisión.
- La clave compartida vive en env (`REVISION_CLAVE`); la cookie es httpOnly,
  firmada con secreto del servidor, con hash de la clave en la firma
  (rotación = revocación).
- Scripts: degradación graceful, exit codes claros, transacciones para no
  dejar estado a medias.

## 10. Testing

- Unit de rutas BFF: gate de acceso, aislamiento `esRevision`, transiciones
  de estado (incluida `RESPONDIDA→ABIERTA` al contestar el experto).
- Unit del reconstructor de timeline con fixtures de spans (shapes tomados de
  los reales de `mastra_ai_spans`; referencia: proyecto observability).
- E2E mínimo: crear sesión → chatear → anotar → responder (script) → ver
  respuesta → resolver.
- `pnpm evals` no cambia con este sistema (los evals nuevos que nazcan de
  notas entran al golden set existente).
- **Gotcha a verificar en el plan**: que habilitar observability en el backend
  no choque con `MASTRA_DISABLE_STORAGE_INIT` en tests.

## 11. Fuera de alcance (MVP)

- Notificaciones (el listado con badges cumple ese rol).
- Edición/borrado de notas (append-only, como `CasoEvento`).
- Anotar conversaciones reales de consultantes — evolución natural del
  sistema, con cuidado de PII; queda registrado como futuro.
- Back-office de review para devs (el "review tool" del dev es Claude Code).
- Auth real para expertos (Auth.js queda como evolución, igual que en v1).

## 12. Relación con la metodología de evals

Este sistema es el mecanismo de recolección que `eval-design.md` da por
supuesto: trazas representativas + open coding por el experto de dominio. El
loop completo queda:

```
Experto anota sesión → feedback:pull → diagnóstico + triage (Claude Code)
  → fix (rule/skill/RAG/código) + caso de eval + respuesta al experto
  → experto re-testea → confirma o reabre
```

Cuando el volumen de notas lo amerite, el axial coding sobre las notas
acumuladas produce la failure taxonomy del proyecto y los primeros scorers
LLM-as-judge (ver `eval-design.md § Eval Failure Analysis`).
