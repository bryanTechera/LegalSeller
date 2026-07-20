# Sistema de revisión y feedback legal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sesiones de revisión anotables para el equipo legal (`/revision`) + tracing de Mastra + pipe dev IA-first (scripts `feedback:pull`/`feedback:respond` + skill `revisar-feedback-legal`).

**Architecture:** Ruta `/revision` en el frontend protegida por clave compartida (cookie HMAC httpOnly), sesiones de revisión con `sessionId` propio server-side que reusan `orchestrateChatTurn`, notas ancladas a `messageId` de Mastra con hilos y estados. Backend: solo habilita `@mastra/observability` (spans → `mastra.mastra_ai_spans`). El reconstructor de timeline lee `mastra.mastra_messages` + `mastra.mastra_ai_spans` directo por Prisma `$queryRaw` (schema `mastra`, read-only) — **refinamiento sobre el spec §3**, que decía proxy HTTP a Mastra para el transcript: leer la DB da UN solo code path compartido entre BFF y scripts, y los 502 quedan solo para turnos de chat.

**Tech Stack:** Next.js 16 App Router, Prisma 6, Zod 4, Vitest 4, Playwright, Mastra (`@mastra/core` 1.41, `@mastra/observability` 1.14 ya instalada), tsx (a agregar en frontend).

**Spec:** `docs/plans/2026-07-20-sistema-revision-feedback-legal.md`

## Global Constraints

- NUNCA `any` — `unknown` + Zod; contratos como schema Zod, tipos con `z.infer`.
- NUNCA `console.log` — `logger` de `@/utils/logger` (frontend) / `makeLogger` (backend). Excepción existente: scripts CLI del backend usan `process.stdout`; los scripts nuevos del frontend siguen ese criterio (salida CLI con `process.stdout.write`, errores con `process.stderr.write`).
- Naming: código inglés camelCase; archivos y rutas kebab-case español; prosa user-facing en español rioplatense.
- Todas las queries aisladas por identidad; verificación server-side en cada route handler.
- Rutas `/api/revision/*` (salvo `acceso`) exigen cookie de experto válida → si no, 401 `{ error: "No autorizado" }`.
- Contenido inyectado a agentes: NO se toca en este plan (cero cambios de prompts).
- Conventional commits; `pnpm lint` + tests antes de cada commit.
- Con `REVISION_CLAVE` sin setear, `POST /api/revision/acceso` responde 503 (feature apagada); el resto de las rutas simplemente nunca autoriza (no hay cookie válida posible).

## File Map

| Archivo | Responsabilidad |
|---|---|
| `backend/src/mastra/index.ts` (mod) | Habilitar observability (spans a storage) |
| `frontend/prisma/schema.prisma` (mod) | `Conversation.esRevision/titulo`, `NotaRevision`, `RespuestaNota`, enums |
| `frontend/src/lib/revision/experto-cookie.ts` | Firma/verificación HMAC de la cookie `ls_experto` |
| `frontend/src/lib/revision/sesiones.ts` | Crear/listar/obtener sesiones de revisión (Prisma) |
| `frontend/src/lib/revision/timeline.ts` | Reconstrucción de timeline (mensajes + spans, `$queryRaw`) |
| `frontend/src/lib/revision/notas.ts` | Notas, respuestas, máquina de estados |
| `frontend/src/lib/validations/revision.ts` | Schemas Zod de todas las rutas de revisión |
| `frontend/src/app/api/revision/acceso/route.ts` | POST acceso (clave + nombre → cookie) |
| `frontend/src/app/api/revision/sesiones/route.ts` | GET listado / POST crear |
| `frontend/src/app/api/revision/sesiones/[id]/route.ts` | GET timeline + notas |
| `frontend/src/app/api/revision/sesiones/[id]/mensajes/route.ts` | POST turno de chat (SSE) |
| `frontend/src/app/api/revision/sesiones/[id]/notas/route.ts` | POST crear nota |
| `frontend/src/app/api/revision/notas/[notaId]/respuestas/route.ts` | POST respuesta del experto |
| `frontend/src/app/api/revision/notas/[notaId]/route.ts` | PATCH resolver |
| `frontend/src/app/revision/page.tsx` + `revision.module.css` | Página: acceso / listado / sesión |
| `frontend/src/components/revision/*` | `AccesoForm`, `ListadoSesiones`, `SesionView`, `NotaThread` |
| `frontend/src/hooks/useRevisionChat.ts` | Chat de revisión + refetch post-turno |
| `frontend/scripts/feedback-pull.ts` | Export markdown de sesiones con notas abiertas |
| `frontend/scripts/feedback-respond.ts` | Publicar respuestas dev / crear nota dev / resolver |
| `.claude/skills/revisar-feedback-legal/SKILL.md` | Skill del ciclo de review |
| `frontend/tests/revision.spec.ts` | E2E mínimo del ciclo |

---

### Task 1: Habilitar tracing de Mastra en el backend

**Files:**
- Modify: `backend/src/mastra/index.ts`

**Interfaces:**
- Consumes: `postgresStore` existente (`config/storage.ts`).
- Produces: spans persistidos en `mastra.mastra_ai_spans` con columnas de primera clase `threadId`, `resourceId`, `spanType` (`agent_run` | `tool_call` | `model_generation`), `entityName` (nombre de tool/agente), `parentEntityName`, `input`, `output`, `error`, `startedAt`, `endedAt`, `attributes` (incluye `usage` y `model` en `model_generation`). Task 6 consume esta tabla.

- [ ] **Step 1: Cablear Observability en el constructor de Mastra**

En `backend/src/mastra/index.ts`, agregar imports y el campo `observability`:

```typescript
import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";
import { Observability, MastraStorageExporter } from "@mastra/observability";
```

y dentro del `new Mastra({ ... })`, después de `storage: postgresStore,`:

```typescript
  observability: new Observability({
    configs: {
      default: {
        serviceName: "legalseller-backend",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
```

Nota: `MastraStorageExporter` persiste al storage configurado (nuestro `postgresStore`, `schemaName: "mastra"`). El `SensitiveDataFilter` viene auto-aplicado (redacta secretos en spans) — dejarlo.

- [ ] **Step 2: Verificar que la suite del backend no se rompe**

Run: `cd backend && pnpm test`
Expected: misma cantidad de tests PASS que antes del cambio (el `MASTRA_DISABLE_STORAGE_INIT: "true"` de `vitest.config.ts` debe seguir evitando conexiones; si algún test truena con ECONNREFUSED por el exporter, agregar en `backend/vitest.config.ts` → `test.env`: `MASTRA_TELEMETRY_DISABLED: "true"` y documentar el gotcha en `CLAUDE.md`).

- [ ] **Step 3: Smoke test en vivo (requiere DB + API key)**

Run (terminal 1): `cd backend && pnpm dev`
Run (terminal 2):

```bash
curl -s -X POST http://localhost:4112/api/agents/recepcion/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hola"}],"memory":{"thread":"chat-smoke-tracing","resource":"smoke-tracing"},"requestContext":{"threadId":"chat-smoke-tracing","resourceId":"smoke-tracing","readOnly":{"userId":"smoke-tracing"}}}' > /dev/null
psql "$DATABASE_URL" -c "SELECT \"spanType\", \"entityName\", \"threadId\" FROM mastra.mastra_ai_spans WHERE \"threadId\" = 'chat-smoke-tracing' ORDER BY \"startedAt\" LIMIT 10;"
```

Expected: al menos una fila `agent_run` con `entityName` del agente y `threadId = chat-smoke-tracing`. Si `spanType`/`entityName` difieren de lo asumido (`agent_run`/`tool_call`/`model_generation`), anotar los valores reales — Task 6 los usa.

- [ ] **Step 4: Commit**

```bash
git add backend/src/mastra/index.ts
git commit -m "feat(backend): tracing de Mastra habilitado (spans a mastra_ai_spans)"
```

---

### Task 2: Schema Prisma — revisión, notas y respuestas

**Files:**
- Modify: `frontend/prisma/schema.prisma`

**Interfaces:**
- Produces: modelos `NotaRevision`, `RespuestaNota`, enums `NotaEstado { ABIERTA RESPONDIDA RESUELTA }`, `AutorOrigen { EXPERTO DEV }`; campos `Conversation.esRevision: Boolean @default(false)`, `Conversation.titulo: String?` y `Conversation.creadaPor: String?`. Consumidos por Tasks 5, 6, 7, 9, 12.

- [ ] **Step 1: Agregar campos y modelos al schema**

En `frontend/prisma/schema.prisma`, dentro de `model Conversation` (después de `correccionAplicada`):

```prisma
  /// Sesión creada por el equipo legal en /revision. Los Caso de estas
  /// conversaciones se EXCLUYEN de toda métrica de negocio (join por este flag).
  esRevision         Boolean   @default(false)
  /// Nombre visible en el listado compartido de revisión.
  titulo             String?
  /// Nombre del experto que creó la sesión (listado compartido).
  creadaPor          String?
```

y en la lista de relaciones de `Conversation` (junto a `caso Caso?`):

```prisma
  notas NotaRevision[]
```

Al final del archivo, agregar:

```prisma
/// Nota de revisión del equipo legal: anclada a un mensaje persistido de
/// Mastra (messageId) o a la sesión entera (messageId null). citaTexto guarda
/// el extracto anotado — resiliencia si el anclaje falla y contexto del export.
model NotaRevision {
  id             String          @id @default(cuid())
  conversationId String
  messageId      String?
  citaTexto      String?
  autor          String
  texto          String
  estado         NotaEstado      @default(ABIERTA)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  conversation Conversation    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  respuestas   RespuestaNota[]

  @@index([conversationId, estado])
}

/// Hilo de ida y vuelta por nota. origen distingue quién habla.
model RespuestaNota {
  id        String       @id @default(cuid())
  notaId    String
  origen    AutorOrigen
  autor     String
  texto     String
  createdAt DateTime     @default(now())

  nota NotaRevision @relation(fields: [notaId], references: [id], onDelete: Cascade)

  @@index([notaId, createdAt])
}

/// ABIERTA = pendiente del equipo dev · RESPONDIDA = pendiente del experto ·
/// RESUELTA = cerrada (cualquiera de los dos lados puede cerrar).
enum NotaEstado {
  ABIERTA
  RESPONDIDA
  RESUELTA
}

enum AutorOrigen {
  EXPERTO
  DEV
}
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `cd frontend && pnpm prisma:migrate --name revision_feedback_legal`
Expected: migración creada en `frontend/prisma/migrations/` y aplicada sin drift (las tablas de Mastra viven en el schema `mastra`, no deben aparecer como drift).

- [ ] **Step 3: Verificar typecheck**

Run: `cd frontend && pnpm typecheck`
Expected: PASS (el client regenerado expone `prisma.notaRevision`, `prisma.respuestaNota`).

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "feat(frontend): schema de sesiones de revisión, notas y respuestas"
```

---

### Task 3: Cookie de experto (HMAC) + env

**Files:**
- Create: `frontend/src/lib/revision/experto-cookie.ts`
- Test: `frontend/src/lib/revision/experto-cookie.test.ts`
- Modify: `frontend/src/lib/env-validation.ts`

**Interfaces:**
- Produces: `EXPERTO_COOKIE = "ls_experto"` · `getRevisionClave(): string | null` · `crearValorCookieExperto(nombre: string, clave: string): string` · `verificarValorCookieExperto(valor: string | undefined, clave: string | null): { nombre: string } | null` · `setExpertoCookie(nombre: string, clave: string): Promise<void>` · `getExperto(): Promise<{ nombre: string } | null>` (gate usado por Tasks 4, 5, 7, 8, 9).

- [ ] **Step 1: Escribir los tests que fallan**

`frontend/src/lib/revision/experto-cookie.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { crearValorCookieExperto, verificarValorCookieExperto } from "./experto-cookie";

const CLAVE = "clave-super-secreta";

describe("cookie de experto", () => {
  it("roundtrip: firma y verifica el nombre", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    expect(verificarValorCookieExperto(valor, CLAVE)).toEqual({ nombre: "Dra. García" });
  });

  it("rechaza una firma adulterada", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    const [payload] = valor.split(".");
    expect(verificarValorCookieExperto(`${payload}.firma-falsa`, CLAVE)).toBeNull();
  });

  it("rechaza un payload adulterado (firma de otro contenido)", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    const [, firma] = valor.split(".");
    const otroPayload = Buffer.from(JSON.stringify({ nombre: "Impostor", iat: 1 })).toString("base64url");
    expect(verificarValorCookieExperto(`${otroPayload}.${firma}`, CLAVE)).toBeNull();
  });

  it("rotar la clave revoca cookies emitidas", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    expect(verificarValorCookieExperto(valor, "clave-rotada")).toBeNull();
  });

  it("clave ausente (feature apagada) nunca autoriza", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    expect(verificarValorCookieExperto(valor, null)).toBeNull();
  });

  it("valores malformados devuelven null, no explotan", () => {
    for (const v of [undefined, "", "sin-punto", "a.b.c", "!!.??"]) {
      expect(verificarValorCookieExperto(v, CLAVE)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && pnpm test:unit run src/lib/revision/experto-cookie.test.ts`
Expected: FAIL — módulo `./experto-cookie` inexistente.

- [ ] **Step 3: Implementar**

`frontend/src/lib/revision/experto-cookie.ts`:

```typescript
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

export const EXPERTO_COOKIE = "ls_experto";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** Clave compartida del modo revisión. null = feature apagada. */
export function getRevisionClave(): string | null {
  return process.env.REVISION_CLAVE ?? null;
}

function firmar(payload: string, clave: string): string {
  return createHmac("sha256", clave).update(payload).digest("base64url");
}

/**
 * Valor de cookie: base64url(JSON { nombre, iat }) + "." + HMAC-SHA256.
 * El secreto de firma ES la clave compartida — rotar REVISION_CLAVE revoca
 * todas las cookies emitidas (spec §9).
 */
export function crearValorCookieExperto(nombre: string, clave: string): string {
  const payload = Buffer.from(JSON.stringify({ nombre, iat: Date.now() })).toString("base64url");
  return `${payload}.${firmar(payload, clave)}`;
}

export function verificarValorCookieExperto(
  valor: string | undefined,
  clave: string | null,
): { nombre: string } | null {
  if (!valor || !clave) return null;
  const partes = valor.split(".");
  if (partes.length !== 2) return null;
  const [payload, firma] = partes;
  if (!payload || !firma) return null;
  const esperada = Buffer.from(firmar(payload, clave));
  const recibida = Buffer.from(firma);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "nombre" in parsed &&
      typeof (parsed as { nombre: unknown }).nombre === "string"
    ) {
      return { nombre: (parsed as { nombre: string }).nombre };
    }
  } catch {
    // payload no-JSON → cae al null final
  }
  return null;
}

export async function setExpertoCookie(nombre: string, clave: string): Promise<void> {
  const store = await cookies();
  store.set(EXPERTO_COOKIE, crearValorCookieExperto(nombre, clave), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
  });
}

/** Gate server-side de /api/revision/*: experto autenticado o null. */
export async function getExperto(): Promise<{ nombre: string } | null> {
  const store = await cookies();
  return verificarValorCookieExperto(store.get(EXPERTO_COOKIE)?.value, getRevisionClave());
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && pnpm test:unit run src/lib/revision/experto-cookie.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Registrar la env var**

En `frontend/src/lib/env-validation.ts`, agregar al array `ENV_CHECKS`:

```typescript
  { name: "REVISION_CLAVE", required: false, hint: "Clave compartida del modo revisión /revision (sin ella la feature queda apagada)" },
```

- [ ] **Step 6: Lint + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add src/lib/revision/experto-cookie.ts src/lib/revision/experto-cookie.test.ts src/lib/env-validation.ts
git commit -m "feat(frontend): cookie firmada de experto para el modo revisión"
```

---

### Task 4: Schemas Zod de revisión + ruta de acceso

**Files:**
- Create: `frontend/src/lib/validations/revision.ts`
- Create: `frontend/src/app/api/revision/acceso/route.ts`
- Test: `frontend/src/app/api/revision/acceso/route.test.ts`
- Modify: `frontend/src/lib/validations/index.ts`

**Interfaces:**
- Consumes: `getRevisionClave`, `setExpertoCookie` (Task 3); `parseRequestBody`, `checkRateLimit` existentes.
- Produces: schemas `accesoRevisionSchema`, `crearSesionSchema`, `crearNotaSchema`, `responderNotaSchema`, `resolverNotaSchema`, `mensajeRevisionSchema` (consumidos por Tasks 5, 8, 9). Ruta `POST /api/revision/acceso`.

- [ ] **Step 1: Escribir los schemas**

`frontend/src/lib/validations/revision.ts`:

```typescript
import { z } from "zod";

export const accesoRevisionSchema = z.object({
  clave: z.string().min(1, "no puede estar vacía"),
  nombre: z.string().trim().min(2, "es demasiado corto").max(60, "es demasiado largo"),
});
export type AccesoRevisionInput = z.infer<typeof accesoRevisionSchema>;

export const crearSesionSchema = z.object({
  titulo: z.string().trim().min(1).max(120).optional(),
});
export type CrearSesionInput = z.infer<typeof crearSesionSchema>;

export const mensajeRevisionSchema = z.object({
  message: z.string().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
});
export type MensajeRevisionInput = z.infer<typeof mensajeRevisionSchema>;

export const crearNotaSchema = z.object({
  texto: z.string().trim().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
  messageId: z.string().min(1).optional(),
  citaTexto: z.string().max(2000).optional(),
});
export type CrearNotaInput = z.infer<typeof crearNotaSchema>;

export const responderNotaSchema = z.object({
  texto: z.string().trim().min(1, "no puede estar vacío").max(4000, "es demasiado largo"),
});
export type ResponderNotaInput = z.infer<typeof responderNotaSchema>;

export const resolverNotaSchema = z.object({
  estado: z.literal("RESUELTA"),
});
export type ResolverNotaInput = z.infer<typeof resolverNotaSchema>;
```

En `frontend/src/lib/validations/index.ts` agregar:

```typescript
export * from "./revision";
```

- [ ] **Step 2: Escribir el test de la ruta (falla)**

`frontend/src/app/api/revision/acceso/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieMock = vi.hoisted(() => ({
  getRevisionClave: vi.fn<() => string | null>(),
  setExpertoCookie: vi.fn(),
}));
vi.mock("@/lib/revision/experto-cookie", () => cookieMock);

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/revision/acceso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/revision/acceso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clave no configurada → 503 (feature apagada)", async () => {
    cookieMock.getRevisionClave.mockReturnValue(null);
    const response = await POST(request({ clave: "x", nombre: "Dra. García" }));
    expect(response.status).toBe(503);
  });

  it("clave incorrecta → 401 y no setea cookie", async () => {
    cookieMock.getRevisionClave.mockReturnValue("la-clave");
    const response = await POST(request({ clave: "otra", nombre: "Dra. García" }));
    expect(response.status).toBe(401);
    expect(cookieMock.setExpertoCookie).not.toHaveBeenCalled();
  });

  it("clave correcta → 200, setea cookie con el nombre", async () => {
    cookieMock.getRevisionClave.mockReturnValue("la-clave");
    const response = await POST(request({ clave: "la-clave", nombre: "Dra. García" }));
    expect(response.status).toBe(200);
    expect(cookieMock.setExpertoCookie).toHaveBeenCalledWith("Dra. García", "la-clave");
  });

  it("body inválido → 400", async () => {
    cookieMock.getRevisionClave.mockReturnValue("la-clave");
    const response = await POST(request({ clave: "la-clave", nombre: "x" }));
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `cd frontend && pnpm test:unit run src/app/api/revision/acceso/route.test.ts`
Expected: FAIL — `./route` inexistente.

- [ ] **Step 4: Implementar la ruta**

`frontend/src/app/api/revision/acceso/route.ts`:

```typescript
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/rate-limit";
import { getRevisionClave, setExpertoCookie } from "@/lib/revision/experto-cookie";
import { accesoRevisionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

function clavesCoinciden(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Acceso del equipo legal al modo revisión: clave compartida + nombre. */
export async function POST(request: Request) {
  try {
    const clave = getRevisionClave();
    if (!clave) {
      return NextResponse.json({ error: "El modo revisión no está habilitado" }, { status: 503 });
    }

    // Freno de fuerza bruta sobre la clave compartida (por IP).
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = checkRateLimit(`revision-acceso:${ip}`, { limit: 10 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Esperá un momento e intentá de nuevo." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const validation = await parseRequestBody(request, accesoRevisionSchema);
    if (!validation.success) return validation.response;

    if (!clavesCoinciden(validation.data.clave, clave)) {
      return NextResponse.json({ error: "La clave no es correcta" }, { status: 401 });
    }

    await setExpertoCookie(validation.data.nombre, clave);
    return NextResponse.json({ ok: true, nombre: validation.data.nombre });
  } catch (error) {
    logger.error("revision/acceso failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd frontend && pnpm test:unit run src/app/api/revision/acceso/route.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 6: Lint + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add src/lib/validations/revision.ts src/lib/validations/index.ts src/app/api/revision/
git commit -m "feat(frontend): acceso al modo revisión con clave compartida"
```

---

### Task 5: Sesiones de revisión — lib + rutas de listado/creación

**Files:**
- Create: `frontend/src/lib/revision/sesiones.ts`
- Test: `frontend/src/lib/revision/sesiones.test.ts`
- Create: `frontend/src/app/api/revision/sesiones/route.ts`

**Interfaces:**
- Consumes: `prisma` singleton; `threadIdForSession` (`@/lib/session`); `getExperto` (Task 3); schemas (Task 4).
- Produces: `crearSesionRevision(params: { titulo?: string; creadaPor: string }): Promise<{ id: string; threadId: string }>` · `listarSesionesRevision(): Promise<SesionResumen[]>` (con `SesionResumen { id, titulo, creadaPor, actualizadaEn, notasAbiertas, notasRespondidas }`) · `getSesionRevision(id: string): Promise<{ id; sessionId; threadId; titulo; creadaPor } | null>` (gate de Tasks 7, 8, 9). Rutas `GET|POST /api/revision/sesiones`.

- [ ] **Step 1: Escribir los tests que fallan**

`frontend/src/lib/revision/sesiones.test.ts` (patrón de mock de `clasificacion.test.ts`):

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("../prisma", () => ({ prisma: db }));

import { crearSesionRevision, getSesionRevision, listarSesionesRevision } from "./sesiones";

describe("sesiones de revisión", () => {
  beforeEach(() => vi.clearAllMocks());

  it("crearSesionRevision genera sessionId propio y marca esRevision", async () => {
    db.conversation.create.mockResolvedValue({ id: "c1", threadId: "chat-x" });
    const result = await crearSesionRevision({ titulo: "Despido con licencia", creadaPor: "Dra. García" });
    expect(result).toEqual({ id: "c1", threadId: "chat-x" });
    const data = db.conversation.create.mock.calls[0][0].data;
    expect(data.esRevision).toBe(true);
    expect(data.creadaPor).toBe("Dra. García");
    expect(data.threadId).toBe(`chat-${data.sessionId}`);
  });

  it("listarSesionesRevision resume conteos de notas por estado", async () => {
    db.conversation.findMany.mockResolvedValue([
      {
        id: "c1", titulo: "t", creadaPor: "Dra. García", updatedAt: new Date("2026-07-20T10:00:00Z"),
        notas: [{ estado: "ABIERTA" }, { estado: "ABIERTA" }, { estado: "RESPONDIDA" }, { estado: "RESUELTA" }],
      },
    ]);
    const [sesion] = await listarSesionesRevision();
    expect(sesion.notasAbiertas).toBe(2);
    expect(sesion.notasRespondidas).toBe(1);
    expect(db.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { esRevision: true } }),
    );
  });

  it("getSesionRevision filtra por esRevision (una conversación real da null)", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    expect(await getSesionRevision("c-real")).toBeNull();
    expect(db.conversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-real", esRevision: true } }),
    );
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && pnpm test:unit run src/lib/revision/sesiones.test.ts`
Expected: FAIL — módulo `./sesiones` inexistente.

- [ ] **Step 3: Implementar la lib**

`frontend/src/lib/revision/sesiones.ts`:

```typescript
import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "../prisma";
import { threadIdForSession } from "../session";

export interface SesionResumen {
  id: string;
  titulo: string | null;
  creadaPor: string | null;
  actualizadaEn: string;
  notasAbiertas: number;
  notasRespondidas: number;
}

/**
 * Crea una sesión de revisión con sessionId propio server-side: NO toca la
 * cookie anónima ls_session del experto como consumidor (spec §3). El thread
 * de Mastra se crea lazy en el primer turno, igual que en el home.
 */
export async function crearSesionRevision(params: {
  titulo?: string;
  creadaPor: string;
}): Promise<{ id: string; threadId: string }> {
  const sessionId = randomUUID();
  return prisma.conversation.create({
    data: {
      sessionId,
      threadId: threadIdForSession(sessionId),
      esRevision: true,
      titulo: params.titulo ?? null,
      creadaPor: params.creadaPor,
    },
    select: { id: true, threadId: true },
  });
}

/** Listado compartido: todo el equipo legal ve todas las sesiones (spec §2). */
export async function listarSesionesRevision(): Promise<SesionResumen[]> {
  const sesiones = await prisma.conversation.findMany({
    where: { esRevision: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titulo: true,
      creadaPor: true,
      updatedAt: true,
      notas: { select: { estado: true } },
    },
  });
  return sesiones.map((sesion) => ({
    id: sesion.id,
    titulo: sesion.titulo,
    creadaPor: sesion.creadaPor,
    actualizadaEn: sesion.updatedAt.toISOString(),
    notasAbiertas: sesion.notas.filter((nota) => nota.estado === "ABIERTA").length,
    notasRespondidas: sesion.notas.filter((nota) => nota.estado === "RESPONDIDA").length,
  }));
}

/** Gate de aislamiento: solo conversaciones de revisión son accesibles acá. */
export async function getSesionRevision(id: string): Promise<{
  id: string;
  sessionId: string;
  threadId: string;
  titulo: string | null;
  creadaPor: string | null;
} | null> {
  return prisma.conversation.findFirst({
    where: { id, esRevision: true },
    select: { id: true, sessionId: true, threadId: true, titulo: true, creadaPor: true },
  });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && pnpm test:unit run src/lib/revision/sesiones.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Implementar la ruta GET/POST**

`frontend/src/app/api/revision/sesiones/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { crearSesionRevision, listarSesionesRevision } from "@/lib/revision/sesiones";
import { crearSesionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function GET() {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    return NextResponse.json({ sesiones: await listarSesionesRevision() });
  } catch (error) {
    logger.error("revision/sesiones GET failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = await parseRequestBody(request, crearSesionSchema);
    if (!validation.success) return validation.response;

    const sesion = await crearSesionRevision({ titulo: validation.data.titulo, creadaPor: experto.nombre });
    return NextResponse.json({ sesion }, { status: 201 });
  } catch (error) {
    logger.error("revision/sesiones POST failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Lint + typecheck + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit run src/lib/revision/
git add src/lib/revision/sesiones.ts src/lib/revision/sesiones.test.ts src/app/api/revision/sesiones/
git commit -m "feat(frontend): sesiones de revisión (crear + listado compartido)"
```

---

### Task 6: Reconstructor de timeline (mensajes + spans)

**Files:**
- Create: `frontend/src/lib/revision/timeline.ts`
- Test: `frontend/src/lib/revision/timeline.test.ts`

**Interfaces:**
- Consumes: `prisma.$queryRaw` (lectura read-only de `mastra.mastra_messages` y `mastra.mastra_ai_spans`; el schema `mastra` lo puebla el backend — Task 1).
- Produces (consumido por Tasks 8 y 12):

```typescript
export interface MensajeTimeline { tipo: "mensaje"; id: string; rol: "user" | "assistant"; texto: string; fecha: string; }
export interface ToolCallTimeline { tipo: "tool-call"; spanId: string; tool: string; agente: string | null; input: unknown; output: unknown; error: unknown; fecha: string; }
export interface AgenteTimeline { tipo: "turno-agente"; spanId: string; agente: string; fecha: string; }
export interface GeneracionTimeline { tipo: "generacion"; spanId: string; modelo: string | null; tokensEntrada: number; tokensSalida: number; fecha: string; }
export type ItemTimeline = MensajeTimeline | ToolCallTimeline | AgenteTimeline | GeneracionTimeline;
export function extraerTexto(content: unknown): string;
export async function construirTimeline(threadId: string, opciones?: { conSpans?: boolean }): Promise<ItemTimeline[]>;
```

- [ ] **Step 1: Escribir los tests que fallan**

`frontend/src/lib/revision/timeline.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("../prisma", () => ({ prisma: db }));

import { construirTimeline, extraerTexto } from "./timeline";

describe("extraerTexto", () => {
  it("extrae texto de contenido format 2 (parts)", () => {
    const content = { format: 2, parts: [{ type: "text", text: "Hola, " }, { type: "text", text: "¿qué tal?" }] };
    expect(extraerTexto(content)).toBe("Hola, ¿qué tal?");
  });

  it("extrae texto de un string JSON serializado", () => {
    expect(extraerTexto(JSON.stringify({ format: 2, parts: [{ type: "text", text: "hola" }] }))).toBe("hola");
  });

  it("string plano queda igual; shapes desconocidos devuelven cadena vacía", () => {
    expect(extraerTexto("texto plano")).toBe("texto plano");
    expect(extraerTexto({ raro: true })).toBe("");
    expect(extraerTexto(null)).toBe("");
  });
});

describe("construirTimeline", () => {
  beforeEach(() => vi.clearAllMocks());

  const mensajes = [
    { id: "m1", role: "user", content: "me despidieron", createdAt: new Date("2026-07-20T10:00:00Z") },
    { id: "m2", role: "assistant", content: { format: 2, parts: [{ type: "text", text: "Lamento tu situación." }] }, createdAt: new Date("2026-07-20T10:00:20Z") },
  ];
  const spans = [
    { spanId: "s1", parentSpanId: null, spanType: "agent_run", name: "agent run: 'laboral'", entityName: "laboral", parentEntityName: null, input: null, output: null, error: null, startedAt: new Date("2026-07-20T10:00:05Z"), endedAt: null, attributes: null },
    { spanId: "s2", parentSpanId: "s1", spanType: "tool_call", name: "tool: 'buscar-documentos'", entityName: "buscar-documentos", parentEntityName: "laboral", input: { query: "plazo reclamo despido" }, output: { chunks: [] }, error: null, startedAt: new Date("2026-07-20T10:00:10Z"), endedAt: null, attributes: null },
    { spanId: "s3", parentSpanId: "s1", spanType: "model_generation", name: "model", entityName: null, parentEntityName: "laboral", input: null, output: null, error: null, startedAt: new Date("2026-07-20T10:00:15Z"), endedAt: null, attributes: { model: "gemini-3-flash", usage: { inputTokens: 100, outputTokens: 50 } } },
  ];

  it("intercala mensajes y spans por fecha, con atribución de tools", async () => {
    db.$queryRaw.mockResolvedValueOnce(mensajes).mockResolvedValueOnce(spans);
    const timeline = await construirTimeline("chat-x", { conSpans: true });
    expect(timeline.map((item) => item.tipo)).toEqual(["mensaje", "turno-agente", "tool-call", "generacion", "mensaje"]);
    const tool = timeline[2];
    if (tool.tipo !== "tool-call") throw new Error("esperaba tool-call");
    expect(tool.tool).toBe("buscar-documentos");
    expect(tool.agente).toBe("laboral");
    const generacion = timeline[3];
    if (generacion.tipo !== "generacion") throw new Error("esperaba generacion");
    expect(generacion.tokensEntrada).toBe(100);
  });

  it("sin conSpans devuelve solo mensajes (una única query)", async () => {
    db.$queryRaw.mockResolvedValueOnce(mensajes);
    const timeline = await construirTimeline("chat-x");
    expect(timeline).toHaveLength(2);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("mensajes de rol desconocido o sin texto se omiten", async () => {
    db.$queryRaw.mockResolvedValueOnce([
      ...mensajes,
      { id: "m3", role: "system", content: "interno", createdAt: new Date("2026-07-20T10:01:00Z") },
      { id: "m4", role: "assistant", content: { raro: true }, createdAt: new Date("2026-07-20T10:01:10Z") },
    ]);
    const timeline = await construirTimeline("chat-x");
    expect(timeline).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && pnpm test:unit run src/lib/revision/timeline.test.ts`
Expected: FAIL — módulo `./timeline` inexistente.

- [ ] **Step 3: Implementar**

`frontend/src/lib/revision/timeline.ts`:

```typescript
import "server-only";

import { z } from "zod";

import { prisma } from "../prisma";

const filaMensajeSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.unknown(),
  createdAt: z.date(),
});

const filaSpanSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  spanType: z.string(),
  name: z.string(),
  entityName: z.string().nullable(),
  parentEntityName: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.unknown(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  attributes: z.unknown(),
});

const atributosGeneracionSchema = z
  .object({
    model: z.string().optional(),
    usage: z
      .object({
        inputTokens: z.coerce.number().optional(),
        outputTokens: z.coerce.number().optional(),
      })
      .optional(),
  })
  .nullable();

export interface MensajeTimeline {
  tipo: "mensaje";
  id: string;
  rol: "user" | "assistant";
  texto: string;
  fecha: string;
}
export interface ToolCallTimeline {
  tipo: "tool-call";
  spanId: string;
  tool: string;
  agente: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  fecha: string;
}
export interface AgenteTimeline {
  tipo: "turno-agente";
  spanId: string;
  agente: string;
  fecha: string;
}
export interface GeneracionTimeline {
  tipo: "generacion";
  spanId: string;
  modelo: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  fecha: string;
}
export type ItemTimeline = MensajeTimeline | ToolCallTimeline | AgenteTimeline | GeneracionTimeline;

/**
 * Extrae el texto visible de un content de mastra_messages. Formatos vistos
 * en producción: string plano, string JSON serializado, y el formato v2
 * { format: 2, parts: [{ type: "text", text }] }. Shapes desconocidos → "".
 */
export function extraerTexto(content: unknown): string {
  if (typeof content === "string") {
    try {
      return extraerTexto(JSON.parse(content));
    } catch {
      return content;
    }
  }
  if (Array.isArray(content)) {
    return content.map(extraerTexto).filter(Boolean).join("\n");
  }
  if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    if (obj.format === 2 && Array.isArray(obj.parts)) {
      return (obj.parts as unknown[])
        .map((part) => {
          if (typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text") {
            const text = (part as { text?: unknown }).text;
            return typeof text === "string" ? text : "";
          }
          return "";
        })
        .join("");
    }
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }
  return "";
}

/**
 * Timeline unificada de una sesión: mensajes de mastra_messages intercalados
 * (por fecha) con los spans de mastra_ai_spans (tool calls con input/output,
 * turno de agente, generaciones con tokens). Lectura read-only del schema
 * `mastra` — un solo code path para el BFF (sin spans) y los scripts (con
 * spans). Las notas se insertan en la UI/export por messageId, no acá.
 */
export async function construirTimeline(
  threadId: string,
  opciones?: { conSpans?: boolean },
): Promise<ItemTimeline[]> {
  const filasMensajes = filaMensajeSchema.array().parse(
    await prisma.$queryRaw`
      SELECT id, role, content, "createdAt"
      FROM mastra.mastra_messages
      WHERE thread_id = ${threadId}
      ORDER BY "createdAt" ASC`,
  );

  const items: ItemTimeline[] = [];
  for (const fila of filasMensajes) {
    if (fila.role !== "user" && fila.role !== "assistant") continue;
    const texto = extraerTexto(fila.content);
    if (!texto.trim()) continue;
    items.push({ tipo: "mensaje", id: fila.id, rol: fila.role, texto, fecha: fila.createdAt.toISOString() });
  }

  if (opciones?.conSpans) {
    const filasSpans = filaSpanSchema.array().parse(
      await prisma.$queryRaw`
        SELECT "spanId", "parentSpanId", "spanType", name, "entityName", "parentEntityName",
               input, output, error, "startedAt", "endedAt", attributes
        FROM mastra.mastra_ai_spans
        WHERE "threadId" = ${threadId}
          AND "spanType" IN ('agent_run', 'tool_call', 'model_generation')
        ORDER BY "startedAt" ASC`,
    );
    for (const span of filasSpans) {
      const fecha = span.startedAt.toISOString();
      if (span.spanType === "tool_call") {
        items.push({
          tipo: "tool-call",
          spanId: span.spanId,
          tool: span.entityName ?? span.name,
          agente: span.parentEntityName,
          input: span.input,
          output: span.output,
          error: span.error,
          fecha,
        });
      } else if (span.spanType === "agent_run") {
        items.push({ tipo: "turno-agente", spanId: span.spanId, agente: span.entityName ?? span.name, fecha });
      } else {
        const atributos = atributosGeneracionSchema.catch(null).parse(span.attributes);
        items.push({
          tipo: "generacion",
          spanId: span.spanId,
          modelo: atributos?.model ?? null,
          tokensEntrada: atributos?.usage?.inputTokens ?? 0,
          tokensSalida: atributos?.usage?.outputTokens ?? 0,
          fecha,
        });
      }
    }
  }

  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && pnpm test:unit run src/lib/revision/timeline.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add src/lib/revision/timeline.ts src/lib/revision/timeline.test.ts
git commit -m "feat(frontend): reconstructor de timeline desde mensajes y spans de Mastra"
```

---

### Task 7: Notas y respuestas — lib con máquina de estados

**Files:**
- Create: `frontend/src/lib/revision/notas.ts`
- Test: `frontend/src/lib/revision/notas.test.ts`

**Interfaces:**
- Consumes: `prisma` singleton; enums Prisma `NotaEstado`, `AutorOrigen` (Task 2).
- Produces (consumido por Tasks 8 y 12):

```typescript
export interface RespuestaDeNota { id: string; origen: "EXPERTO" | "DEV"; autor: string; texto: string; createdAt: string; }
export interface NotaConRespuestas { id: string; messageId: string | null; citaTexto: string | null; autor: string; texto: string; estado: "ABIERTA" | "RESPONDIDA" | "RESUELTA"; createdAt: string; respuestas: RespuestaDeNota[]; }
export async function listarNotasDeSesion(conversationId: string): Promise<NotaConRespuestas[]>;
export async function crearNota(params: { conversationId: string; origen: "EXPERTO" | "DEV"; autor: string; texto: string; messageId?: string; citaTexto?: string }): Promise<{ id: string }>;
export async function responderNota(params: { notaId: string; origen: "EXPERTO" | "DEV"; autor: string; texto: string }): Promise<{ ok: boolean }>;
export async function resolverNota(notaId: string): Promise<{ ok: boolean }>;
```

Máquina de estados (spec §4): nota de EXPERTO nace `ABIERTA`; nota de DEV nace `RESPONDIDA`. Respuesta DEV sobre `ABIERTA` → `RESPONDIDA`; respuesta EXPERTO sobre `RESPONDIDA` → `ABIERTA`; responder una `RESUELTA` se rechaza (`{ ok: false }`); resolver siempre permitido (idempotente).

- [ ] **Step 1: Escribir los tests que fallan**

`frontend/src/lib/revision/notas.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  notaRevision: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  respuestaNota: { create: vi.fn() },
}));
vi.mock("../prisma", () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) },
}));

import { crearNota, resolverNota, responderNota } from "./notas";

describe("crearNota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nota de experto nace ABIERTA", async () => {
    tx.notaRevision.create.mockResolvedValue({ id: "n1" });
    await crearNota({ conversationId: "c1", origen: "EXPERTO", autor: "Dra. García", texto: "Inventó el plazo", messageId: "m2", citaTexto: "tenés 30 días" });
    expect(tx.notaRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "ABIERTA", autor: "Dra. García", messageId: "m2" }) }),
    );
  });

  it("nota del equipo dev nace RESPONDIDA (pendiente del experto)", async () => {
    tx.notaRevision.create.mockResolvedValue({ id: "n2" });
    await crearNota({ conversationId: "c1", origen: "DEV", autor: "equipo-dev", texto: "¿Podés aclarar el escenario?" });
    expect(tx.notaRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "RESPONDIDA" }) }),
    );
  });
});

describe("responderNota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("respuesta DEV sobre ABIERTA → crea respuesta y pasa a RESPONDIDA", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "ABIERTA" });
    const result = await responderNota({ notaId: "n1", origen: "DEV", autor: "equipo-dev", texto: "Corregido, probá de nuevo" });
    expect(result.ok).toBe(true);
    expect(tx.respuestaNota.create).toHaveBeenCalled();
    expect(tx.notaRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" }, data: { estado: "RESPONDIDA" } }),
    );
  });

  it("respuesta EXPERTO sobre RESPONDIDA → vuelve a ABIERTA", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "RESPONDIDA" });
    const result = await responderNota({ notaId: "n1", origen: "EXPERTO", autor: "Dra. García", texto: "Sigue mal" });
    expect(result.ok).toBe(true);
    expect(tx.notaRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: "ABIERTA" } }),
    );
  });

  it("respuesta del mismo lado no cambia el estado", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "ABIERTA" });
    const result = await responderNota({ notaId: "n1", origen: "EXPERTO", autor: "Dra. García", texto: "Agrego contexto" });
    expect(result.ok).toBe(true);
    expect(tx.respuestaNota.create).toHaveBeenCalled();
    expect(tx.notaRevision.update).not.toHaveBeenCalled();
  });

  it("nota RESUELTA o inexistente → rechaza sin escribir", async () => {
    tx.notaRevision.findUnique.mockResolvedValueOnce({ id: "n1", estado: "RESUELTA" }).mockResolvedValueOnce(null);
    expect((await responderNota({ notaId: "n1", origen: "DEV", autor: "equipo-dev", texto: "x" })).ok).toBe(false);
    expect((await responderNota({ notaId: "nope", origen: "DEV", autor: "equipo-dev", texto: "x" })).ok).toBe(false);
    expect(tx.respuestaNota.create).not.toHaveBeenCalled();
  });
});

describe("resolverNota", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marca RESUELTA una nota existente", async () => {
    tx.notaRevision.findUnique.mockResolvedValue({ id: "n1", estado: "ABIERTA" });
    expect((await resolverNota("n1")).ok).toBe(true);
    expect(tx.notaRevision.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" }, data: { estado: "RESUELTA" } }),
    );
  });

  it("nota inexistente → ok false", async () => {
    tx.notaRevision.findUnique.mockResolvedValue(null);
    expect((await resolverNota("nope")).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && pnpm test:unit run src/lib/revision/notas.test.ts`
Expected: FAIL — módulo `./notas` inexistente.

- [ ] **Step 3: Implementar**

`frontend/src/lib/revision/notas.ts`:

```typescript
import "server-only";

import { prisma } from "../prisma";

export interface RespuestaDeNota {
  id: string;
  origen: "EXPERTO" | "DEV";
  autor: string;
  texto: string;
  createdAt: string;
}

export interface NotaConRespuestas {
  id: string;
  messageId: string | null;
  citaTexto: string | null;
  autor: string;
  texto: string;
  estado: "ABIERTA" | "RESPONDIDA" | "RESUELTA";
  createdAt: string;
  respuestas: RespuestaDeNota[];
}

export async function listarNotasDeSesion(conversationId: string): Promise<NotaConRespuestas[]> {
  const notas = await prisma.notaRevision.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { respuestas: { orderBy: { createdAt: "asc" } } },
  });
  return notas.map((nota) => ({
    id: nota.id,
    messageId: nota.messageId,
    citaTexto: nota.citaTexto,
    autor: nota.autor,
    texto: nota.texto,
    estado: nota.estado,
    createdAt: nota.createdAt.toISOString(),
    respuestas: nota.respuestas.map((respuesta) => ({
      id: respuesta.id,
      origen: respuesta.origen,
      autor: respuesta.autor,
      texto: respuesta.texto,
      createdAt: respuesta.createdAt.toISOString(),
    })),
  }));
}

/**
 * Estado inicial por origen (spec §4): una nota de experto queda pendiente
 * del equipo dev (ABIERTA); una nota creada por el dev (pedido de aclaración)
 * queda pendiente del experto (RESPONDIDA).
 */
export async function crearNota(params: {
  conversationId: string;
  origen: "EXPERTO" | "DEV";
  autor: string;
  texto: string;
  messageId?: string;
  citaTexto?: string;
}): Promise<{ id: string }> {
  return prisma.notaRevision.create({
    data: {
      conversationId: params.conversationId,
      autor: params.autor,
      texto: params.texto,
      messageId: params.messageId ?? null,
      citaTexto: params.citaTexto ?? null,
      estado: params.origen === "EXPERTO" ? "ABIERTA" : "RESPONDIDA",
    },
    select: { id: true },
  });
}

/**
 * Semántica "a quién le toca": responder desde el lado que NO tiene el turno
 * pasa el turno al otro lado; responder desde el mismo lado solo agrega al
 * hilo. RESUELTA es terminal para respuestas (reabrir = nota nueva).
 */
export async function responderNota(params: {
  notaId: string;
  origen: "EXPERTO" | "DEV";
  autor: string;
  texto: string;
}): Promise<{ ok: boolean }> {
  return prisma.$transaction(async (tx) => {
    const nota = await tx.notaRevision.findUnique({
      where: { id: params.notaId },
      select: { id: true, estado: true },
    });
    if (!nota || nota.estado === "RESUELTA") return { ok: false };

    await tx.respuestaNota.create({
      data: { notaId: nota.id, origen: params.origen, autor: params.autor, texto: params.texto },
    });

    const siguiente =
      params.origen === "DEV" && nota.estado === "ABIERTA"
        ? "RESPONDIDA"
        : params.origen === "EXPERTO" && nota.estado === "RESPONDIDA"
          ? "ABIERTA"
          : null;
    if (siguiente) {
      await tx.notaRevision.update({ where: { id: nota.id }, data: { estado: siguiente } });
    }
    return { ok: true };
  });
}

/** Cualquiera de los dos lados puede cerrar (spec §4). Idempotente. */
export async function resolverNota(notaId: string): Promise<{ ok: boolean }> {
  return prisma.$transaction(async (tx) => {
    const nota = await tx.notaRevision.findUnique({ where: { id: notaId }, select: { id: true } });
    if (!nota) return { ok: false };
    await tx.notaRevision.update({ where: { id: notaId }, data: { estado: "RESUELTA" } });
    return { ok: true };
  });
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && pnpm test:unit run src/lib/revision/notas.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add src/lib/revision/notas.ts src/lib/revision/notas.test.ts
git commit -m "feat(frontend): notas de revisión con hilos y máquina de estados"
```

---

### Task 8: Rutas de detalle de sesión, notas, respuestas y resolución

**Files:**
- Create: `frontend/src/app/api/revision/sesiones/[id]/route.ts`
- Create: `frontend/src/app/api/revision/sesiones/[id]/notas/route.ts`
- Create: `frontend/src/app/api/revision/notas/[notaId]/respuestas/route.ts`
- Create: `frontend/src/app/api/revision/notas/[notaId]/route.ts`

**Interfaces:**
- Consumes: `getExperto` (Task 3), `getSesionRevision` (Task 5), `construirTimeline` (Task 6), `listarNotasDeSesion`/`crearNota`/`responderNota`/`resolverNota` (Task 7), schemas (Task 4).
- Produces: `GET /api/revision/sesiones/:id` → `{ sesion, timeline, notas }` · `POST /api/revision/sesiones/:id/notas` → 201 `{ nota: { id } }` · `POST /api/revision/notas/:notaId/respuestas` → `{ ok }` · `PATCH /api/revision/notas/:notaId` → `{ ok }`. Consumidos por la UI (Tasks 10-11).

Las rutas son wrappers finos sobre libs ya testeadas (Tasks 5-7) — sin unit tests propios, siguiendo la práctica del proyecto (rutas finas, libs testeadas); el ciclo completo lo cubre el E2E (Task 14). Nota: `messageId` de una nota NO se valida contra Mastra (la cita `citaTexto` es la resiliencia si el anclaje quedara huérfano — spec §4).

- [ ] **Step 1: Implementar GET detalle de sesión**

`frontend/src/app/api/revision/sesiones/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { listarNotasDeSesion } from "@/lib/revision/notas";
import { getSesionRevision } from "@/lib/revision/sesiones";
import { construirTimeline } from "@/lib/revision/timeline";
import { logger } from "@/utils/logger";

/** Detalle para la UI del experto: transcript con IDs persistidos + notas. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sesion = await getSesionRevision(id);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const [timeline, notas] = await Promise.all([
      construirTimeline(sesion.threadId),
      listarNotasDeSesion(sesion.id),
    ]);
    return NextResponse.json({
      sesion: { id: sesion.id, titulo: sesion.titulo, creadaPor: sesion.creadaPor },
      timeline,
      notas,
    });
  } catch (error) {
    logger.error("revision/sesiones/:id GET failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implementar POST de notas**

`frontend/src/app/api/revision/sesiones/[id]/notas/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { crearNota } from "@/lib/revision/notas";
import { getSesionRevision } from "@/lib/revision/sesiones";
import { crearNotaSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sesion = await getSesionRevision(id);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const validation = await parseRequestBody(request, crearNotaSchema);
    if (!validation.success) return validation.response;

    const nota = await crearNota({
      conversationId: sesion.id,
      origen: "EXPERTO",
      autor: experto.nombre,
      texto: validation.data.texto,
      messageId: validation.data.messageId,
      citaTexto: validation.data.citaTexto,
    });
    return NextResponse.json({ nota }, { status: 201 });
  } catch (error) {
    logger.error("revision/notas POST failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Implementar POST de respuestas y PATCH de resolución**

`frontend/src/app/api/revision/notas/[notaId]/respuestas/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { responderNota } from "@/lib/revision/notas";
import { parseRequestBody, responderNotaSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/** Respuesta del EXPERTO en el hilo (el lado dev responde vía scripts). */
export async function POST(request: Request, { params }: { params: Promise<{ notaId: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { notaId } = await params;
    const validation = await parseRequestBody(request, responderNotaSchema);
    if (!validation.success) return validation.response;

    const result = await responderNota({
      notaId,
      origen: "EXPERTO",
      autor: experto.nombre,
      texto: validation.data.texto,
    });
    if (!result.ok) return NextResponse.json({ error: "La nota no admite respuestas" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("revision/respuestas POST failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

`frontend/src/app/api/revision/notas/[notaId]/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { getExperto } from "@/lib/revision/experto-cookie";
import { resolverNota } from "@/lib/revision/notas";
import { parseRequestBody, resolverNotaSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function PATCH(request: Request, { params }: { params: Promise<{ notaId: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { notaId } = await params;
    const validation = await parseRequestBody(request, resolverNotaSchema);
    if (!validation.success) return validation.response;

    const result = await resolverNota(notaId);
    if (!result.ok) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("revision/notas PATCH failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verificar + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit run
git add src/app/api/revision/
git commit -m "feat(frontend): rutas de detalle de sesión, notas y respuestas de revisión"
```

---

### Task 9: Turno de chat de revisión (SSE)

**Files:**
- Create: `frontend/src/app/api/revision/sesiones/[id]/mensajes/route.ts`

**Interfaces:**
- Consumes: `getExperto` (Task 3), `getSesionRevision` (Task 5), `orchestrateChatTurn` (existente — firma `(params: { sessionId: string; message: string }) => Promise<Response>`), `mensajeRevisionSchema` (Task 4), `checkRateLimit`.
- Produces: `POST /api/revision/sesiones/:id/mensajes` → SSE idéntico a `/api/chat/stream` (lo consume `useRevisionChat`, Task 11).

El turno usa el `sessionId` de la sesión de revisión (server-side), NO la cookie `ls_session` — el experto puede tener N sesiones y su identidad de consumidor no se toca (spec §3). Mastra caído → el catch devuelve 502 (spec §9: mensaje de reintento).

- [ ] **Step 1: Implementar la ruta**

`frontend/src/app/api/revision/sesiones/[id]/mensajes/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { orchestrateChatTurn } from "@/lib/chat-orchestrator";
import { checkRateLimit } from "@/lib/rate-limit";
import { getExperto } from "@/lib/revision/experto-cookie";
import { getSesionRevision } from "@/lib/revision/sesiones";
import { mensajeRevisionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

/**
 * Turno de chat de una sesión de revisión: mismo pipeline que el home
 * (orchestrateChatTurn — receptor, clasificación, agente de categoría,
 * captación), con el sessionId de la sesión elegida. El experto testea
 * exactamente lo que ve un consultante.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sesion = await getSesionRevision(id);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const rate = checkRateLimit(`revision-chat:${sesion.sessionId}`);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados mensajes seguidos. Esperá un momento e intentá de nuevo." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }

    const validation = await parseRequestBody(request, mensajeRevisionSchema);
    if (!validation.success) return validation.response;

    return await orchestrateChatTurn({ sessionId: sesion.sessionId, message: validation.data.message });
  } catch (error) {
    logger.error("revision/mensajes failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "No pudimos hablar con el asistente. Intentá de nuevo en unos instantes." },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 2: Verificar + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add src/app/api/revision/sesiones/
git commit -m "feat(frontend): turno de chat SSE para sesiones de revisión"
```

---

### Task 10: UI — página `/revision`, acceso y listado compartido

**Files:**
- Create: `frontend/src/app/revision/page.tsx`
- Create: `frontend/src/components/revision/AccesoForm.tsx`
- Create: `frontend/src/components/revision/ListadoSesiones.tsx`
- Create: `frontend/src/components/revision/revision.module.css`

**Interfaces:**
- Consumes: rutas de Tasks 4-5; `SesionResumen` (shape JSON de `GET /sesiones`).
- Produces: página client-side con tres estados (`acceso` → `listado` → sesión abierta); `<AccesoForm onAcceso={() => void} />`; `<ListadoSesiones sesiones onAbrir(id) onCrear(titulo) />`. Task 11 agrega `SesionView` (acá se deja un placeholder que Task 11 reemplaza).

Las tasks de UI se verifican con `pnpm typecheck` + `pnpm lint` + el E2E de Task 14 (son capa fina sobre rutas ya testeadas; el proyecto no tiene tests unitarios de componentes de página). Estilos: seguir los tokens/typography de `globals.css`, tono sobrio; es una herramienta interna pero comparte marca.

- [ ] **Step 1: CSS base**

`frontend/src/components/revision/revision.module.css`:

```css
.shell { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; }
.encabezado { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.titulo { font-size: 1.25rem; font-weight: 600; }
.subtitulo { color: var(--color-text-secondary, #667); font-size: 0.9rem; }

.formAcceso { display: grid; gap: 12px; max-width: 380px; margin: 48px auto; }
.campo { display: grid; gap: 4px; }
.campo label { font-size: 0.85rem; font-weight: 500; }
.campo input { padding: 10px 12px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 8px; font: inherit; }
.botonPrimario { padding: 10px 16px; border: none; border-radius: 8px; background: var(--color-accent, #1f2937); color: #fff; font: inherit; font-weight: 600; cursor: pointer; }
.botonPrimario:disabled { opacity: 0.5; cursor: default; }
.botonSecundario { padding: 8px 12px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 8px; background: transparent; font: inherit; cursor: pointer; }
.error { color: #b91c1c; font-size: 0.9rem; }

.listado { display: grid; gap: 10px; }
.tarjetaSesion { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 10px; background: transparent; font: inherit; text-align: left; cursor: pointer; width: 100%; }
.tarjetaSesion:hover { border-color: var(--color-accent, #1f2937); }
.tarjetaMeta { color: var(--color-text-secondary, #667); font-size: 0.8rem; }
.badges { display: flex; gap: 6px; flex-shrink: 0; }
.badgeAbierta { background: #fef3c7; color: #92400e; border-radius: 999px; padding: 2px 10px; font-size: 0.75rem; }
.badgeRespondida { background: #dbeafe; color: #1e40af; border-radius: 999px; padding: 2px 10px; font-size: 0.75rem; }
.filaNueva { display: flex; gap: 8px; margin-bottom: 18px; }
.filaNueva input { flex: 1; padding: 10px 12px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 8px; font: inherit; }
```

- [ ] **Step 2: AccesoForm**

`frontend/src/components/revision/AccesoForm.tsx`:

```tsx
"use client";

import { useState } from "react";

import styles from "./revision.module.css";

export function AccesoForm({ onAcceso }: { onAcceso: () => void }) {
  const [clave, setClave] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const response = await fetch("/api/revision/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, nombre }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "No pudimos validar el acceso.");
      }
      onAcceso();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos validar el acceso.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className={styles.formAcceso} onSubmit={(event) => void handleSubmit(event)}>
      <h1 className={styles.titulo}>Revisión de Jurco</h1>
      <p className={styles.subtitulo}>Espacio del equipo legal para probar el asistente y dejar notas.</p>
      <div className={styles.campo}>
        <label htmlFor="revision-nombre">Tu nombre</label>
        <input id="revision-nombre" value={nombre} onChange={(event) => setNombre(event.target.value)} autoComplete="name" />
      </div>
      <div className={styles.campo}>
        <label htmlFor="revision-clave">Clave de acceso</label>
        <input id="revision-clave" type="password" value={clave} onChange={(event) => setClave(event.target.value)} />
      </div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <button type="submit" className={styles.botonPrimario} disabled={enviando || !clave || nombre.trim().length < 2}>
        Entrar
      </button>
    </form>
  );
}
```

- [ ] **Step 3: ListadoSesiones**

`frontend/src/components/revision/ListadoSesiones.tsx`:

```tsx
"use client";

import { useState } from "react";

import type { SesionResumen } from "@/lib/revision/sesiones";

import styles from "./revision.module.css";

// Re-export type-only: la página importa el tipo desde acá sin tocar la lib
// server-side (el import type se borra en compile y no dispara server-only).
export type { SesionResumen };

export function ListadoSesiones({
  sesiones,
  onAbrir,
  onCrear,
}: {
  sesiones: SesionResumen[];
  onAbrir: (id: string) => void;
  onCrear: (titulo: string) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [creando, setCreando] = useState(false);

  const handleCrear = async () => {
    setCreando(true);
    try {
      await onCrear(titulo.trim());
      setTitulo("");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div>
      <div className={styles.filaNueva}>
        <input
          value={titulo}
          placeholder="Título de la nueva sesión (opcional)"
          onChange={(event) => setTitulo(event.target.value)}
          aria-label="Título de la nueva sesión"
        />
        <button type="button" className={styles.botonPrimario} onClick={() => void handleCrear()} disabled={creando}>
          Nueva sesión de revisión
        </button>
      </div>
      <ul className={styles.listado}>
        {sesiones.map((sesion) => (
          <li key={sesion.id}>
            <button type="button" className={styles.tarjetaSesion} onClick={() => onAbrir(sesion.id)}>
              <span>
                <span>{sesion.titulo ?? "Sesión sin título"}</span>
                <br />
                <span className={styles.tarjetaMeta}>
                  {sesion.creadaPor ?? "—"} · {new Date(sesion.actualizadaEn).toLocaleString("es-UY")}
                </span>
              </span>
              <span className={styles.badges}>
                {sesion.notasAbiertas > 0 ? <span className={styles.badgeAbierta}>{sesion.notasAbiertas} abiertas</span> : null}
                {sesion.notasRespondidas > 0 ? (
                  <span className={styles.badgeRespondida}>{sesion.notasRespondidas} con respuesta</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {sesiones.length === 0 ? <p className={styles.subtitulo}>Todavía no hay sesiones. Creá la primera.</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Página con los tres estados**

`frontend/src/app/revision/page.tsx` (el `SesionView` real llega en Task 11; acá un placeholder mínimo para que compile):

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

import { AccesoForm } from "@/components/revision/AccesoForm";
import { ListadoSesiones, type SesionResumen } from "@/components/revision/ListadoSesiones";
import styles from "@/components/revision/revision.module.css";

type Vista = { tipo: "cargando" } | { tipo: "acceso" } | { tipo: "listado" } | { tipo: "sesion"; id: string };

export default function RevisionPage() {
  const [vista, setVista] = useState<Vista>({ tipo: "cargando" });
  const [sesiones, setSesiones] = useState<SesionResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargarListado = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/revision/sesiones");
    if (response.status === 401 || response.status === 503) {
      setVista({ tipo: "acceso" });
      return;
    }
    if (!response.ok) {
      setError("No pudimos cargar las sesiones. Recargá la página.");
      setVista({ tipo: "listado" });
      return;
    }
    const payload = (await response.json()) as { sesiones: SesionResumen[] };
    setSesiones(payload.sesiones);
    setVista({ tipo: "listado" });
  }, []);

  useEffect(() => {
    void cargarListado();
  }, [cargarListado]);

  const crearSesion = useCallback(
    async (titulo: string) => {
      const response = await fetch("/api/revision/sesiones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(titulo ? { titulo } : {}),
      });
      if (!response.ok) {
        setError("No pudimos crear la sesión.");
        return;
      }
      const payload = (await response.json()) as { sesion: { id: string } };
      setVista({ tipo: "sesion", id: payload.sesion.id });
    },
    [],
  );

  return (
    <div className={styles.shell}>
      {vista.tipo === "acceso" ? (
        <AccesoForm onAcceso={() => void cargarListado()} />
      ) : vista.tipo === "listado" ? (
        <>
          <header className={styles.encabezado}>
            <h1 className={styles.titulo}>Sesiones de revisión</h1>
            <p className={styles.subtitulo}>Espacio compartido del equipo legal</p>
          </header>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          <ListadoSesiones sesiones={sesiones} onAbrir={(id) => setVista({ tipo: "sesion", id })} onCrear={crearSesion} />
        </>
      ) : vista.tipo === "sesion" ? (
        // Placeholder — Task 11 lo reemplaza por <SesionView id={vista.id} onVolver={...} />
        <p className={styles.subtitulo}>Sesión {vista.id}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Verificar + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck
git add src/app/revision/ src/components/revision/
git commit -m "feat(frontend): página /revision con acceso y listado compartido"
```

---

### Task 11: UI — vista de sesión: chat anotable + hilos de notas

**Files:**
- Create: `frontend/src/hooks/useRevisionChat.ts`
- Create: `frontend/src/components/revision/SesionView.tsx`
- Create: `frontend/src/components/revision/NotaThread.tsx`
- Modify: `frontend/src/app/revision/page.tsx` (reemplazar el placeholder)
- Modify: `frontend/src/components/revision/revision.module.css` (agregar clases al final)

**Interfaces:**
- Consumes: rutas de Tasks 8-9; tipos `ItemTimeline` (Task 6, `import type`) y `NotaConRespuestas` (Task 7, `import type` — imports type-only, se borran en compile y no disparan `server-only`).
- Produces: `useRevisionChat(sesionId): { detalle, isStreaming, pendienteUsuario, textoStreaming, error, sendMessage, refetch }` · `<SesionView id onVolver />` · `<NotaThread nota onResponder onResolver />`.

- [ ] **Step 1: Hook de chat + detalle**

`frontend/src/hooks/useRevisionChat.ts`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

import type { NotaConRespuestas } from "@/lib/revision/notas";
import type { ItemTimeline } from "@/lib/revision/timeline";
import { createSseLineSplitter, parseSseData } from "@/utils/sse";

export interface DetalleSesion {
  sesion: { id: string; titulo: string | null; creadaPor: string | null };
  timeline: ItemTimeline[];
  notas: NotaConRespuestas[];
}

const GENERIC_ERROR = "No pudimos obtener una respuesta. Intentá de nuevo en unos instantes.";

/**
 * Detalle + chat de una sesión de revisión. A diferencia de useChatStream,
 * la fuente de verdad del transcript es el server (GET detalle, con
 * messageId persistidos de Mastra — el anclaje de notas los necesita):
 * durante el stream se muestran burbujas transitorias y al cerrar el turno
 * se refetchea el detalle (spec §8).
 */
export function useRevisionChat(sesionId: string) {
  const [detalle, setDetalle] = useState<DetalleSesion | null>(null);
  const [pendienteUsuario, setPendienteUsuario] = useState<string | null>(null);
  const [textoStreaming, setTextoStreaming] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const response = await fetch(`/api/revision/sesiones/${sesionId}`);
    if (!response.ok) {
      setError("No pudimos cargar la sesión. Recargá la página.");
      return;
    }
    setDetalle((await response.json()) as DetalleSesion);
  }, [sesionId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const sendMessage = useCallback(
    async (texto: string) => {
      const trimmed = texto.trim();
      if (!trimmed || isStreaming) return;
      setPendienteUsuario(trimmed);
      setTextoStreaming("");
      setIsStreaming(true);
      setError(null);
      try {
        const response = await fetch(`/api/revision/sesiones/${sesionId}/mensajes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? GENERIC_ERROR);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const feed = createSseLineSplitter();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const data of feed(decoder.decode(value, { stream: true }))) {
            const event = parseSseData(data);
            if (!event) continue;
            if (event.kind === "text") setTextoStreaming((prev) => (prev ?? "") + event.text);
            if (event.kind === "error") throw new Error(GENERIC_ERROR);
          }
        }
        await refetch();
      } catch (caught) {
        setError(caught instanceof Error && caught.message ? caught.message : GENERIC_ERROR);
      } finally {
        setPendienteUsuario(null);
        setTextoStreaming(null);
        setIsStreaming(false);
      }
    },
    [sesionId, isStreaming, refetch],
  );

  return { detalle, isStreaming, pendienteUsuario, textoStreaming, error, sendMessage, refetch };
}
```

- [ ] **Step 2: CSS de la vista de sesión**

Agregar al FINAL de `frontend/src/components/revision/revision.module.css`:

```css
.sesionLayout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
@media (max-width: 860px) { .sesionLayout { grid-template-columns: 1fr; } }
.chatColumna { display: grid; gap: 10px; }
.mensajeUsuario { justify-self: end; max-width: 85%; background: var(--color-accent, #1f2937); color: #fff; padding: 10px 14px; border-radius: 14px 14px 4px 14px; }
.mensajeAsistente { max-width: 92%; padding: 10px 14px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 14px 14px 14px 4px; }
.accionesMensaje { margin-top: 6px; }
.botonNota { font-size: 0.75rem; padding: 2px 8px; border: 1px dashed var(--color-border, #aab); border-radius: 999px; background: transparent; cursor: pointer; }
.marcadorNota { font-size: 0.75rem; color: #92400e; }
.composer { display: flex; gap: 8px; margin-top: 12px; }
.composer textarea { flex: 1; padding: 10px 12px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 8px; font: inherit; resize: vertical; min-height: 44px; }
.panelNotas { display: grid; gap: 12px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 10px; padding: 14px; }
.nota { border-top: 1px solid var(--color-border, #e2e2ea); padding-top: 10px; display: grid; gap: 6px; }
.notaMeta { font-size: 0.75rem; color: var(--color-text-secondary, #667); }
.notaCita { font-size: 0.8rem; color: var(--color-text-secondary, #667); border-left: 3px solid var(--color-border, #d5d5dd); padding-left: 8px; font-style: italic; }
.respuestaDev { background: #eef2ff; border-radius: 8px; padding: 8px 10px; font-size: 0.9rem; }
.respuestaExperto { background: #f8fafc; border-radius: 8px; padding: 8px 10px; font-size: 0.9rem; }
.formNota { display: grid; gap: 6px; }
.formNota textarea { padding: 8px 10px; border: 1px solid var(--color-border, #d5d5dd); border-radius: 8px; font: inherit; min-height: 60px; }
.filaBotones { display: flex; gap: 8px; justify-content: flex-end; }
```

- [ ] **Step 3: NotaThread**

`frontend/src/components/revision/NotaThread.tsx`:

```tsx
"use client";

import { useState } from "react";

import type { NotaConRespuestas } from "@/lib/revision/notas";

import styles from "./revision.module.css";

const ESTADO_LABEL: Record<NotaConRespuestas["estado"], string> = {
  ABIERTA: "Abierta — esperando al equipo",
  RESPONDIDA: "Respondida — esperando tu revisión",
  RESUELTA: "Resuelta",
};

export function NotaThread({
  nota,
  onResponder,
  onResolver,
}: {
  nota: NotaConRespuestas;
  onResponder: (notaId: string, texto: string) => Promise<void>;
  onResolver: (notaId: string) => Promise<void>;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleResponder = async () => {
    if (!respuesta.trim()) return;
    setEnviando(true);
    try {
      await onResponder(nota.id, respuesta.trim());
      setRespuesta("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.nota}>
      <p className={styles.notaMeta}>
        {nota.autor} · {new Date(nota.createdAt).toLocaleString("es-UY")} · {ESTADO_LABEL[nota.estado]}
      </p>
      {nota.citaTexto ? <p className={styles.notaCita}>“{nota.citaTexto}”</p> : null}
      <p>{nota.texto}</p>
      {nota.respuestas.map((r) => (
        <div key={r.id} className={r.origen === "DEV" ? styles.respuestaDev : styles.respuestaExperto}>
          <p className={styles.notaMeta}>{r.autor} · {new Date(r.createdAt).toLocaleString("es-UY")}</p>
          <p>{r.texto}</p>
        </div>
      ))}
      {nota.estado !== "RESUELTA" ? (
        <div className={styles.formNota}>
          <textarea
            value={respuesta}
            placeholder="Responder…"
            onChange={(event) => setRespuesta(event.target.value)}
            aria-label="Responder la nota"
          />
          <div className={styles.filaBotones}>
            <button type="button" className={styles.botonSecundario} onClick={() => void onResolver(nota.id)}>
              Marcar resuelta
            </button>
            <button type="button" className={styles.botonPrimario} disabled={enviando || !respuesta.trim()} onClick={() => void handleResponder()}>
              Responder
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: SesionView**

`frontend/src/components/revision/SesionView.tsx`:

```tsx
"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useRevisionChat } from "@/hooks/useRevisionChat";

import { NotaThread } from "./NotaThread";
import styles from "./revision.module.css";

export function SesionView({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { detalle, isStreaming, pendienteUsuario, textoStreaming, error, sendMessage, refetch } = useRevisionChat(id);
  const [draft, setDraft] = useState("");
  const [notaPara, setNotaPara] = useState<{ messageId: string | null; cita: string | null } | null>(null);
  const [textoNota, setTextoNota] = useState("");

  const crearNota = async () => {
    if (!notaPara || !textoNota.trim()) return;
    const response = await fetch(`/api/revision/sesiones/${id}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: textoNota.trim(),
        ...(notaPara.messageId ? { messageId: notaPara.messageId } : {}),
        ...(notaPara.cita ? { citaTexto: notaPara.cita.slice(0, 2000) } : {}),
      }),
    });
    if (response.ok) {
      setNotaPara(null);
      setTextoNota("");
      await refetch();
    }
  };

  const responderNota = async (notaId: string, texto: string) => {
    await fetch(`/api/revision/notas/${notaId}/respuestas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    await refetch();
  };

  const resolverNota = async (notaId: string) => {
    await fetch(`/api/revision/notas/${notaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "RESUELTA" }),
    });
    await refetch();
  };

  const mensajes = (detalle?.timeline ?? []).filter((item) => item.tipo === "mensaje");
  const notasDeMensaje = (messageId: string) => (detalle?.notas ?? []).filter((nota) => nota.messageId === messageId);

  return (
    <div>
      <header className={styles.encabezado}>
        <div>
          <h1 className={styles.titulo}>{detalle?.sesion.titulo ?? "Sesión de revisión"}</h1>
          <p className={styles.subtitulo}>Creada por {detalle?.sesion.creadaPor ?? "—"}</p>
        </div>
        <button type="button" className={styles.botonSecundario} onClick={onVolver}>
          Volver al listado
        </button>
      </header>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      <div className={styles.sesionLayout}>
        <section aria-label="Conversación de prueba" className={styles.chatColumna}>
          {mensajes.map((mensaje) => (
            <article key={mensaje.id} className={mensaje.rol === "user" ? styles.mensajeUsuario : styles.mensajeAsistente}>
              {mensaje.rol === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{mensaje.texto}</ReactMarkdown>
              ) : (
                <p>{mensaje.texto}</p>
              )}
              <div className={styles.accionesMensaje}>
                {notasDeMensaje(mensaje.id).length > 0 ? (
                  <span className={styles.marcadorNota}>{notasDeMensaje(mensaje.id).length} nota(s)</span>
                ) : null}{" "}
                <button
                  type="button"
                  className={styles.botonNota}
                  onClick={() => setNotaPara({ messageId: mensaje.id, cita: mensaje.texto.slice(0, 300) })}
                >
                  Dejar nota
                </button>
              </div>
            </article>
          ))}
          {pendienteUsuario ? (
            <article className={styles.mensajeUsuario}><p>{pendienteUsuario}</p></article>
          ) : null}
          {textoStreaming !== null ? (
            <article className={styles.mensajeAsistente}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textoStreaming}</ReactMarkdown>
            </article>
          ) : null}
          {notaPara ? (
            <div className={styles.formNota}>
              {notaPara.cita ? <p className={styles.notaCita}>“{notaPara.cita}”</p> : null}
              <textarea
                value={textoNota}
                placeholder="¿Qué observaste en esta respuesta?"
                onChange={(event) => setTextoNota(event.target.value)}
                aria-label="Texto de la nota"
              />
              <div className={styles.filaBotones}>
                <button type="button" className={styles.botonSecundario} onClick={() => setNotaPara(null)}>
                  Cancelar
                </button>
                <button type="button" className={styles.botonPrimario} disabled={!textoNota.trim()} onClick={() => void crearNota()}>
                  Guardar nota
                </button>
              </div>
            </div>
          ) : null}
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
              setDraft("");
            }}
          >
            <textarea
              value={draft}
              placeholder="Probá al asistente como si fueras un consultante…"
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Mensaje de prueba"
            />
            <button type="submit" className={styles.botonPrimario} disabled={isStreaming || !draft.trim()}>
              Enviar
            </button>
          </form>
        </section>
        <aside aria-label="Notas de la sesión" className={styles.panelNotas}>
          <div className={styles.filaBotones}>
            <button type="button" className={styles.botonNota} onClick={() => setNotaPara({ messageId: null, cita: null })}>
              Nota general de la sesión
            </button>
          </div>
          {(detalle?.notas ?? []).length === 0 ? <p className={styles.subtitulo}>Sin notas todavía.</p> : null}
          {(detalle?.notas ?? []).map((nota) => (
            <NotaThread key={nota.id} nota={nota} onResponder={responderNota} onResolver={resolverNota} />
          ))}
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Reemplazar el placeholder de la página**

En `frontend/src/app/revision/page.tsx`, agregar el import:

```tsx
import { SesionView } from "@/components/revision/SesionView";
```

y reemplazar el bloque del placeholder:

```tsx
      ) : vista.tipo === "sesion" ? (
        <SesionView id={vista.id} onVolver={() => void cargarListado()} />
      ) : null}
```

(`onVolver` recarga el listado y vuelve a la vista `listado` — `cargarListado` ya setea `vista`.)

- [ ] **Step 6: Verificar + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit run
git add src/hooks/useRevisionChat.ts src/components/revision/ src/app/revision/
git commit -m "feat(frontend): vista de sesión de revisión con chat anotable e hilos de notas"
```

---

### Task 12: Scripts `feedback:pull` y `feedback:respond`

**Files:**
- Create: `frontend/src/lib/revision/exportar-markdown.ts`
- Test: `frontend/src/lib/revision/exportar-markdown.test.ts`
- Create: `frontend/scripts/feedback-pull.ts`
- Create: `frontend/scripts/feedback-respond.ts`
- Modify: `frontend/package.json` (scripts + devDeps `tsx`, `dotenv`)
- Modify: `.gitignore` (raíz — agregar `tmp/`)

**Interfaces:**
- Consumes: `construirTimeline` (Task 6), `listarNotasDeSesion`/`crearNota`/`responderNota`/`resolverNota` (Task 7), `prisma` singleton.
- Produces: `formatearSesionMarkdown(params: { sesion: { id: string; titulo: string | null; creadaPor: string | null }; timeline: ItemTimeline[]; notas: NotaConRespuestas[] }): string` · CLI `pnpm feedback:pull` (markdown por sesión en `tmp/feedback-legal/` de la raíz del repo) · CLI `pnpm feedback:respond` (responder / crear nota dev / resolver). Consumidos por la skill (Task 13).

**Cómo corren fuera de Next:** las libs compartidas importan (transitivamente) el paquete `server-only`, que tira al importarse en Node pelado. Se ejecutan con la condición de resolución `react-server`, que hace que `server-only` resuelva a su no-op `empty.js` (mismo truco que el alias de `vitest.config.ts`). `DATABASE_URL` se carga con `dotenv/config` como PRIMER import del script.

- [ ] **Step 1: Test del formateador (falla)**

`frontend/src/lib/revision/exportar-markdown.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import type { NotaConRespuestas } from "./notas";
import type { ItemTimeline } from "./timeline";

import { formatearSesionMarkdown } from "./exportar-markdown";

const sesion = { id: "c1", titulo: "Despido con certificación", creadaPor: "Dra. García" };
const timeline: ItemTimeline[] = [
  { tipo: "mensaje", id: "m1", rol: "user", texto: "me despidieron estando certificado", fecha: "2026-07-20T10:00:00.000Z" },
  { tipo: "turno-agente", spanId: "s1", agente: "laboral", fecha: "2026-07-20T10:00:05.000Z" },
  { tipo: "tool-call", spanId: "s2", tool: "buscar-documentos", agente: "laboral", input: { query: "despido certificado" }, output: { chunks: ["..."] }, error: null, fecha: "2026-07-20T10:00:10.000Z" },
  { tipo: "generacion", spanId: "s3", modelo: "gemini-3-flash", tokensEntrada: 100, tokensSalida: 50, fecha: "2026-07-20T10:00:15.000Z" },
  { tipo: "mensaje", id: "m2", rol: "assistant", texto: "Te corresponde el despido especial…", fecha: "2026-07-20T10:00:20.000Z" },
];
const notas: NotaConRespuestas[] = [
  {
    id: "n1", messageId: "m2", citaTexto: "despido especial", autor: "Dra. García",
    texto: "Falta citar el artículo", estado: "ABIERTA", createdAt: "2026-07-20T11:00:00.000Z",
    respuestas: [{ id: "r1", origen: "DEV", autor: "equipo-dev", texto: "Lo estamos viendo", createdAt: "2026-07-20T12:00:00.000Z" }],
  },
  { id: "n2", messageId: null, citaTexto: null, autor: "Dra. García", texto: "En general muy robótico", estado: "ABIERTA", createdAt: "2026-07-20T11:05:00.000Z", respuestas: [] },
];

describe("formatearSesionMarkdown", () => {
  const md = formatearSesionMarkdown({ sesion, timeline, notas });

  it("encabeza con la sesión y sus IDs", () => {
    expect(md).toContain("# Sesión de revisión: Despido con certificación");
    expect(md).toContain("c1");
    expect(md).toContain("Dra. García");
  });

  it("la nota anclada aparece INMEDIATAMENTE después de su mensaje, con estado, id y respuestas", () => {
    const posMensaje = md.indexOf("Te corresponde el despido especial");
    const posNota = md.indexOf("Falta citar el artículo");
    const posSiguienteSeccion = md.indexOf("## Notas generales");
    expect(posMensaje).toBeGreaterThan(-1);
    expect(posNota).toBeGreaterThan(posMensaje);
    expect(posNota).toBeLessThan(posSiguienteSeccion);
    expect(md).toContain("n1");
    expect(md).toContain("ABIERTA");
    expect(md).toContain("Lo estamos viendo");
  });

  it("incluye tool calls con input/output y las notas generales al final", () => {
    expect(md).toContain("buscar-documentos");
    expect(md).toContain("despido certificado");
    expect(md).toContain("## Notas generales");
    expect(md).toContain("En general muy robótico");
  });

  it("trunca payloads de tools gigantes con un marcador explícito", () => {
    const gigante = { chunks: "x".repeat(10_000) };
    const conGigante = formatearSesionMarkdown({
      sesion,
      timeline: [{ tipo: "tool-call", spanId: "s9", tool: "buscar-documentos", agente: "laboral", input: {}, output: gigante, error: null, fecha: "2026-07-20T10:00:10.000Z" }],
      notas: [],
    });
    expect(conGigante).toContain("[truncado:");
    expect(conGigante.length).toBeLessThan(9_000);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && pnpm test:unit run src/lib/revision/exportar-markdown.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar el formateador**

`frontend/src/lib/revision/exportar-markdown.ts` (SIN `import "server-only"` — es puro y lo usan los scripts):

```typescript
import type { NotaConRespuestas } from "./notas";
import type { ItemTimeline } from "./timeline";

const MAX_PAYLOAD_CHARS = 4000;

function json(valor: unknown): string {
  const texto = JSON.stringify(valor, null, 1) ?? "null";
  if (texto.length <= MAX_PAYLOAD_CHARS) return texto;
  return `${texto.slice(0, MAX_PAYLOAD_CHARS)}\n[truncado: ${String(texto.length - MAX_PAYLOAD_CHARS)} chars omitidos]`;
}

function formatearNota(nota: NotaConRespuestas): string {
  const lineas = [
    `> **NOTA ${nota.id} (${nota.estado})** — ${nota.autor} — ${nota.createdAt}`,
    ...(nota.citaTexto ? [`> Cita: "${nota.citaTexto}"`] : []),
    `> ${nota.texto}`,
    ...nota.respuestas.map((r) => `> - [${r.origen}] ${r.autor} (${r.createdAt}): ${r.texto}`),
  ];
  return lineas.join("\n");
}

/**
 * Markdown de una sesión para el review con Claude Code: timeline completa
 * (mensajes, agente por turno, tool calls con input/output, tokens) con las
 * notas del experto insertadas junto al mensaje exacto que anotan (spec §7).
 */
export function formatearSesionMarkdown(params: {
  sesion: { id: string; titulo: string | null; creadaPor: string | null };
  timeline: ItemTimeline[];
  notas: NotaConRespuestas[];
}): string {
  const { sesion, timeline, notas } = params;
  const notasPorMensaje = new Map<string, NotaConRespuestas[]>();
  for (const nota of notas) {
    if (!nota.messageId) continue;
    const lista = notasPorMensaje.get(nota.messageId) ?? [];
    lista.push(nota);
    notasPorMensaje.set(nota.messageId, lista);
  }

  const secciones: string[] = [
    `# Sesión de revisión: ${sesion.titulo ?? "(sin título)"}`,
    `- conversationId: ${sesion.id}`,
    `- Creada por: ${sesion.creadaPor ?? "—"}`,
    `- Notas: ${String(notas.length)} (${String(notas.filter((n) => n.estado === "ABIERTA").length)} abiertas)`,
    "",
    "## Timeline",
  ];

  for (const item of timeline) {
    if (item.tipo === "mensaje") {
      const rol = item.rol === "user" ? "CONSULTANTE (experto probando)" : "ASISTENTE";
      secciones.push(`### [${rol}] ${item.fecha} — messageId: ${item.id}`, "", item.texto, "");
      for (const nota of notasPorMensaje.get(item.id) ?? []) {
        secciones.push(formatearNota(nota), "");
      }
    } else if (item.tipo === "turno-agente") {
      secciones.push(`_agente en turno: ${item.agente}_`, "");
    } else if (item.tipo === "tool-call") {
      secciones.push(
        `#### tool-call: ${item.tool}${item.agente ? ` (agente: ${item.agente})` : ""} — ${item.fecha}`,
        "```json",
        `// input\n${json(item.input)}`,
        `// output\n${json(item.output)}`,
        ...(item.error ? [`// error\n${json(item.error)}`] : []),
        "```",
        "",
      );
    } else {
      secciones.push(`_generación: ${item.modelo ?? "?"} · ${String(item.tokensEntrada)} in / ${String(item.tokensSalida)} out_`, "");
    }
  }

  secciones.push("## Notas generales");
  const generales = notas.filter((nota) => !nota.messageId);
  if (generales.length === 0) secciones.push("(ninguna)");
  for (const nota of generales) secciones.push(formatearNota(nota), "");

  return secciones.join("\n");
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd frontend && pnpm test:unit run src/lib/revision/exportar-markdown.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Dependencias y package.json**

Run: `cd frontend && pnpm add -D tsx dotenv`

En `frontend/package.json` → `scripts`, agregar:

```json
    "feedback:pull": "tsx --conditions=react-server scripts/feedback-pull.ts",
    "feedback:respond": "tsx --conditions=react-server scripts/feedback-respond.ts",
```

(Si la versión de tsx no reenviara `--conditions` a Node, usar la forma `NODE_OPTIONS=--conditions=react-server tsx scripts/feedback-pull.ts`.)

En `.gitignore` de la raíz agregar la línea:

```
tmp/
```

- [ ] **Step 6: Script de pull**

`frontend/scripts/feedback-pull.ts`:

```typescript
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { prisma } from "../src/lib/prisma";
import { formatearSesionMarkdown } from "../src/lib/revision/exportar-markdown";
import { listarNotasDeSesion } from "../src/lib/revision/notas";
import { construirTimeline } from "../src/lib/revision/timeline";

// El script corre vía pnpm desde frontend/ — cwd estable, sin depender de
// __dirname (que cambia según el modo CJS/ESM de tsx).
const DESTINO = path.resolve(process.cwd(), "../tmp/feedback-legal");

async function main(): Promise<void> {
  const sesiones = await prisma.conversation.findMany({
    where: { esRevision: true, notas: { some: { estado: "ABIERTA" } } },
    select: { id: true, threadId: true, titulo: true, creadaPor: true },
    orderBy: { updatedAt: "desc" },
  });

  if (sesiones.length === 0) {
    process.stdout.write("No hay sesiones de revisión con notas abiertas.\n");
    return;
  }

  mkdirSync(DESTINO, { recursive: true });
  for (const sesion of sesiones) {
    const [timeline, notas] = await Promise.all([
      construirTimeline(sesion.threadId, { conSpans: true }),
      listarNotasDeSesion(sesion.id),
    ]);
    const archivo = path.join(DESTINO, `${sesion.id}.md`);
    writeFileSync(archivo, formatearSesionMarkdown({ sesion, timeline, notas }), "utf8");
    const abiertas = notas.filter((nota) => nota.estado === "ABIERTA").length;
    process.stdout.write(`${archivo} — ${String(abiertas)} nota(s) abiertas\n`);
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`feedback:pull falló: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
```

- [ ] **Step 7: Script de respond**

`frontend/scripts/feedback-respond.ts`:

```typescript
import "dotenv/config";

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { prisma } from "../src/lib/prisma";
import { crearNota, resolverNota, responderNota } from "../src/lib/revision/notas";

const AUTOR_DEV = "equipo-dev";

const USO = `Uso:
  pnpm feedback:respond --nota <id> --texto "..." [--resolver]   responde una nota (y opcionalmente la cierra)
  pnpm feedback:respond --nota <id> --archivo <path> [--resolver] idem, texto desde archivo
  pnpm feedback:respond --nota <id> --resolver                    solo cierra la nota
  pnpm feedback:respond --sesion <conversationId> --texto "..."   crea una nota nueva del equipo dev (nace RESPONDIDA)
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      nota: { type: "string" },
      sesion: { type: "string" },
      texto: { type: "string" },
      archivo: { type: "string" },
      resolver: { type: "boolean", default: false },
    },
  });

  const texto = values.archivo ? readFileSync(values.archivo, "utf8").trim() : values.texto?.trim();

  if (values.sesion) {
    if (!texto) throw new Error(`--sesion requiere --texto o --archivo\n${USO}`);
    const nota = await crearNota({ conversationId: values.sesion, origen: "DEV", autor: AUTOR_DEV, texto });
    process.stdout.write(`Nota ${nota.id} creada (RESPONDIDA) en la sesión ${values.sesion}\n`);
    return;
  }

  if (!values.nota) throw new Error(USO);

  if (texto) {
    const result = await responderNota({ notaId: values.nota, origen: "DEV", autor: AUTOR_DEV, texto });
    if (!result.ok) throw new Error(`La nota ${values.nota} no existe o está RESUELTA.`);
    process.stdout.write(`Respuesta publicada en la nota ${values.nota}\n`);
  }

  if (values.resolver) {
    const result = await resolverNota(values.nota);
    if (!result.ok) throw new Error(`La nota ${values.nota} no existe.`);
    process.stdout.write(`Nota ${values.nota} marcada RESUELTA\n`);
  }

  if (!texto && !values.resolver) throw new Error(USO);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`feedback:respond falló: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
```

- [ ] **Step 8: Smoke de los scripts (requiere DB con datos de Task 1-11)**

```bash
cd frontend && pnpm feedback:pull
```

Expected: o bien "No hay sesiones de revisión con notas abiertas." o los paths de los `.md` generados en `tmp/feedback-legal/`. Verificar que un `.md` generado tiene timeline + notas.

- [ ] **Step 9: Lint + commit**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit run src/lib/revision/
git add src/lib/revision/exportar-markdown.ts src/lib/revision/exportar-markdown.test.ts scripts/ package.json pnpm-lock.yaml ../.gitignore
git commit -m "feat(frontend): scripts feedback:pull y feedback:respond para el ciclo de revisión"
```

---

### Task 13: Skill `revisar-feedback-legal` + docs

**Files:**
- Create: `.claude/skills/revisar-feedback-legal/SKILL.md`
- Modify: `CLAUDE.md` (comandos + regla de proceso)

**Interfaces:**
- Consumes: scripts de Task 12; skill `procesar-documento-legal`, rules `.claude/rules/*` existentes.

- [ ] **Step 1: Escribir la skill**

`.claude/skills/revisar-feedback-legal/SKILL.md`:

```markdown
---
name: revisar-feedback-legal
description: Use cuando haya notas abiertas del equipo legal en sesiones de revisión (/revision), o cuando el equipo pida procesar el feedback de una sesión — diagnóstico sobre la timeline con spans, triage por nota, fix, eval anti-regresión y respuesta al experto.
---

# Revisar feedback del equipo legal

Cierra el loop de mejora continua: los expertos legales prueban el sistema en
`/revision` y dejan notas; acá cada nota se diagnostica sobre la timeline
completa (mensajes + tool calls con input/output + agente por turno), se
convierte en un fix con su eval, y se le responde al experto.

**Anunciar al inicio:** "Procesando el feedback con la skill revisar-feedback-legal."

**Guías de fondo:** `.claude/rules/eval-design.md` (open coding del primer
fallo upstream), `.claude/rules/rules-and-skills-taxonomy.md` (destinos),
`.claude/rules/agent-prompting.md` (cómo escribir el fix),
`docs/plans/2026-07-20-sistema-revision-feedback-legal.md` (diseño del sistema).

## Checklist (crear un todo por fase)

### Fase 1 — Pull
- Correr `pnpm feedback:pull` (workspace `frontend/`). Los markdown quedan en
  `tmp/feedback-legal/<conversationId>.md` (no versionados).
- Leer CADA archivo ENTERO antes de tocar nada.

### Fase 2 — Diagnóstico por nota (open coding)
Para CADA nota abierta, sobre la timeline:
- Identificar el PRIMER fallo upstream (no los síntomas en cascada). La
  evidencia está en los tool calls: ¿`buscar-documentos` devolvió el dato y el
  agente lo ignoró (prompt)? ¿no lo devolvió (hueco de corpus o retrieval)?
  ¿`asignar-clasificacion`/`registrar-caso` corrieron cuando/como debían?
- Anotar el diagnóstico en una línea, con el spanId/messageId de la evidencia.

### Fase 3 — Triage por nota
Destino del fix (uno o varios): rule · skill · RAG (`pnpm ingest`) · eval ·
pregunta al equipo legal (`docs/preguntas-legales/`, enviable) · bug de código.
Usar el árbol de decisión de `rules-and-skills-taxonomy.md`. Si la duda es de
dominio legal (criterio, plazo, alcance), NO resolver por cuenta propia:
registrar la pregunta enviable (regla SIEMPRE de `CLAUDE.md`).

### Fase 4 — Implementar
- Fix de prompt/rule/skill: seguir `agent-prompting.md` y validar con `pnpm evals`.
- Contenido legal nuevo: pasa por la skill `procesar-documento-legal`, no por acá.
- Bug de código: test primero, fix después.

### Fase 5 — Eval anti-regresión
Si la nota reveló un fallo de comportamiento, agregar el caso al golden set
(`backend/src/test/`) para que el fallo no vuelva silenciosamente. Una nota
resuelta sin eval es un parche, no una mejora.

### Fase 6 — Responder al experto
- `pnpm feedback:respond --nota <id> --texto "..."` (o `--archivo`).
- Voz para abogados, sin jerga técnica (misma voz que `docs/preguntas-legales/`):
  qué se corrigió (o qué se necesita aclarar), y si aplica, invitación a
  re-probar el escenario en una sesión nueva.
- `--resolver` solo si no queda nada pendiente del lado dev y no se espera
  re-test del experto; si se espera confirmación, dejarla RESPONDIDA.
- Pedidos de aclaración generales: `--sesion <conversationId> --texto "..."`.

### Fase 7 — Resumen del ciclo
Reportar: notas procesadas, fixes por destino, evals nuevos, preguntas
enviadas al equipo legal, notas que quedaron esperando aclaración.
```

- [ ] **Step 2: Actualizar CLAUDE.md**

En `CLAUDE.md` § Reglas críticas, agregar después de la regla de `procesar-documento-legal`:

```markdown
- **SIEMPRE** procesar las notas del equipo legal en sesiones de revisión (`/revision`) con la skill `revisar-feedback-legal`: diagnóstico sobre la timeline con spans, triage, fix + eval anti-regresión, y respuesta al experto vía `pnpm feedback:respond`.
```

En `CLAUDE.md` § Comandos, en la línea de Frontend agregar al final: `· pnpm feedback:pull · pnpm feedback:respond`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/revisar-feedback-legal/ CLAUDE.md
git commit -m "feat: skill revisar-feedback-legal para el ciclo de mejora continua"
```

---

### Task 14: E2E mínimo del ciclo + verificación integral

**Files:**
- Create: `frontend/tests/revision.spec.ts`

**Interfaces:**
- Consumes: toda la feature (Tasks 1-13). Requiere stack completo corriendo: Postgres + backend Mastra (`cd backend && pnpm dev`) + `REVISION_CLAVE` seteada en `frontend/.env` (el `webServer` de Playwright levanta el frontend).

- [ ] **Step 1: Escribir el spec E2E**

`frontend/tests/revision.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

const CLAVE = process.env.REVISION_CLAVE ?? "";

test.skip(!CLAVE, "REVISION_CLAVE no seteada — E2E de revisión deshabilitado");

test("ciclo de revisión: acceso → sesión nueva → chat → nota anclada", async ({ page }) => {
  await page.goto("/revision");

  await page.getByLabel("Tu nombre").fill("Dra. E2E");
  await page.getByLabel("Clave de acceso").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { name: "Sesiones de revisión" })).toBeVisible();
  await page.getByLabel("Título de la nueva sesión").fill("E2E despido");
  await page.getByRole("button", { name: "Nueva sesión de revisión" }).click();

  await page.getByLabel("Mensaje de prueba").fill("Hola, me despidieron sin causa después de 6 años");
  await page.getByRole("button", { name: "Enviar" }).click();

  // Tras el turno, el transcript persistido se recarga con messageId reales.
  await expect(page.getByRole("button", { name: "Dejar nota" }).first()).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Dejar nota" }).last().click();
  await page.getByLabel("Texto de la nota").fill("Nota E2E: revisar esta respuesta");
  await page.getByRole("button", { name: "Guardar nota" }).click();

  await expect(page.getByText("Nota E2E: revisar esta respuesta")).toBeVisible();
  await expect(page.getByText("Abierta — esperando al equipo")).toBeVisible();
});
```

- [ ] **Step 2: Correr el E2E (stack arriba)**

Run (con backend corriendo y `REVISION_CLAVE` en `frontend/.env`):
`cd frontend && pnpm test tests/revision.spec.ts`
Expected: 1 passed (o skipped si falta la clave — no bloquea CI).

- [ ] **Step 3: Verificación integral**

```bash
cd backend && pnpm lint && pnpm test
cd ../frontend && pnpm lint && pnpm typecheck && pnpm test:unit run
```

Expected: todo PASS. `pnpm evals` NO forma parte del gate de este plan (cero cambios de prompts/corpus).

- [ ] **Step 4: Commit final**

```bash
git add frontend/tests/revision.spec.ts
git commit -m "test(frontend): e2e del ciclo de revisión del equipo legal"
```
