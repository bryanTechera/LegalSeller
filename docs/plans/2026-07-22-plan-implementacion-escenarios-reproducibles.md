# Plan de implementación — Sistema de escenarios reproducibles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Runner CLI (`pnpm escenario`) que reproduce conversaciones guionadas contra los endpoints de `/revision` con introspección completa (tool-calls, latencias, caso), corridas autónomas diferenciadas y publicables al listado del equipo legal, y skill `reproducir-escenario` que fija el proceso.

**Architecture:** Los escenarios son JSON versionados en `frontend/escenarios/`; el runner es HTTP puro contra un entorno objetivo (default prod) usando la cookie de experto de `/revision` y el parser SSE existente; las corridas nacen `borrador: true` con `origenRevision: AUTONOMA` y se publican con un PATCH. La lógica pura (schema, expectativas, render) vive en `src/lib/escenarios/` para ser testeable con vitest (el include es `src/**`); los scripts en `scripts/escenario/` son IO fino.

**Tech Stack:** Next.js route handlers + Prisma (frontend), Zod v4, tsx + `node:util` parseArgs (CLI), fetch nativo Node 22, vitest + testing-library.

**Spec:** `docs/plans/2026-07-22-sistema-escenarios-reproducibles.md`

## Global Constraints

- NUNCA `any` — `unknown` + Zod; contratos como schema Zod, tipos con `z.infer`.
- NUNCA `console.log` — en scripts CLI usar `process.stdout.write` / `process.stderr.write` (patrón de `scripts/feedback-pull.ts`).
- Rama de trabajo: `feat/escenarios-reproducibles` (ya existe, con el spec commiteado). NUNCA push directo a main; conventional commits con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Naming: código inglés camelCase SOLO para lo que ya es inglés en el repo; este subsistema sigue el patrón existente del repo (identificadores en español donde el módulo vecino los usa así, p. ej. `crearSesionRevision`). Archivos kebab-case; prosa user-facing en español rioplatense.
- Los scripts importan desde `src/` con paths RELATIVOS (`../src/...`), como `scripts/feedback-pull.ts` — tsx no resuelve el alias `@/`.
- `frontend/.env` apunta a Postgres localhost; la migración de prod la aplica Railway (`preDeployCommand: npx prisma migrate deploy`). No correr `prisma migrate dev` contra prod.
- ESLint cubre todo `frontend/` (`eslint .`): template literals con números van con `String(n)` (`restrict-template-expressions`).
- URL default de prod: `https://frontend-production-1293.up.railway.app`.

---

### Task 1: Migración Prisma — `origenRevision` + `borrador`

**Files:**
- Modify: `frontend/prisma/schema.prisma` (model `Conversation`, ~línea 64; enums al final del archivo)
- Create: `frontend/prisma/migrations/20260722200000_escenarios_revision_origen/migration.sql`

**Interfaces:**
- Produces: columnas `Conversation.origenRevision` (`RevisionOrigen?` = `EXPERTO | AUTONOMA | null`) y `Conversation.borrador` (`Boolean @default(false)`); cliente Prisma regenerado con esos tipos. Tasks 2+ compilan contra esto.

- [ ] **Step 1: Agregar enum y campos al schema**

En `frontend/prisma/schema.prisma`, dentro de `model Conversation`, después del campo `creadaPor`:

```prisma
  /// Quién originó la sesión de revisión (null = conversación normal del home).
  origenRevision RevisionOrigen?
  /// Corrida autónoma aún no publicada: fuera del listado del equipo legal.
  borrador       Boolean         @default(false)
```

Y junto a los otros enums (después de `enum CasoEventoTipo`):

```prisma
/// Origen de una sesión de revisión: creada por un experto en /revision o
/// generada por el runner autónomo de escenarios (pnpm escenario).
enum RevisionOrigen {
  EXPERTO
  AUTONOMA
}
```

- [ ] **Step 2: Generar la migración**

Con el Postgres local levantado: `cd frontend && npx prisma migrate dev --create-only --name escenarios_revision_origen`, y verificar que el SQL generado coincida con el del paso 3 (sin el UPDATE).

Si el Postgres local NO está disponible (Docker apagado en esta WSL): crear a mano el directorio `frontend/prisma/migrations/20260722200000_escenarios_revision_origen/` con el `migration.sql` del paso 3 — `prisma migrate deploy` de Railway lo aplica en el preDeploy, y `prisma migrate dev` local lo reconocerá como aplicado cuando la base local exista.

- [ ] **Step 3: Completar el SQL con el backfill**

Contenido final de `migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "RevisionOrigen" AS ENUM ('EXPERTO', 'AUTONOMA');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "borrador" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "origenRevision" "RevisionOrigen";

-- Backfill: toda sesión de revisión existente fue creada por un experto.
UPDATE "Conversation" SET "origenRevision" = 'EXPERTO' WHERE "esRevision" = true;
```

Si el paso 2 corrió con `--create-only`, aplicarla ahora: `npx prisma migrate dev`.

- [ ] **Step 4: Regenerar el cliente y validar**

Run: `cd frontend && npx prisma generate && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid` y cliente generado sin errores (generate no necesita DB).

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma
git commit -m "feat(revision): origenRevision y borrador en Conversation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: API de revisión extendida (validations + lib + rutas, TDD)

**Files:**
- Modify: `frontend/src/lib/validations/revision.ts`
- Modify: `frontend/src/lib/revision/sesiones.ts`
- Modify: `frontend/src/app/api/revision/sesiones/route.ts`
- Modify: `frontend/src/app/api/revision/sesiones/[id]/route.ts`
- Test (create): `frontend/src/app/api/revision/sesiones/route.test.ts`
- Test (create): `frontend/src/app/api/revision/sesiones/[id]/route.test.ts`

**Interfaces:**
- Consumes: tipos Prisma de Task 1 (`origenRevision`, `borrador`).
- Produces:
  - `crearSesionSchema` acepta `origen?: "autonoma"`; nuevo `publicarSesionSchema = z.object({ borrador: z.literal(false) })` (re-exportado por `src/lib/validations/index.ts` vía `export * from "./revision"`, sin tocar el index).
  - `crearSesionRevision({ titulo?, creadaPor, origen? })`; `listarSesionesRevision(options?: { incluirBorradores?: boolean })`; `SesionResumen` con `origenRevision: "EXPERTO" | "AUTONOMA" | null` y `borrador: boolean`; `getSesionRevision` devuelve además esos dos campos; nuevas `publicarSesionRevision(id): Promise<boolean>` y `getCasoDeSesion(conversationId): Promise<CasoSnapshot | null>` con `CasoSnapshot` exportado.
  - HTTP: `GET /api/revision/sesiones?borradores=1` · `POST /api/revision/sesiones {titulo?, origen?}` · `GET /api/revision/sesiones/:id` responde además `caso` y `sesion.{origenRevision,borrador}` · `PATCH /api/revision/sesiones/:id {borrador:false}` publica (404 si no existe o no era borrador).

- [ ] **Step 1: Escribir los route tests (fallan por ahora)**

`frontend/src/app/api/revision/sesiones/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const expertoMock = vi.hoisted(() => ({ getExperto: vi.fn() }));
vi.mock("@/lib/revision/experto-cookie", () => expertoMock);

const sesionesMock = vi.hoisted(() => ({
  crearSesionRevision: vi.fn(),
  listarSesionesRevision: vi.fn(),
}));
vi.mock("@/lib/revision/sesiones", () => sesionesMock);

import { GET, POST } from "./route";

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/revision/sesiones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/revision/sesiones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expertoMock.getExperto.mockResolvedValue({ nombre: "Dra. García" });
    sesionesMock.listarSesionesRevision.mockResolvedValue([]);
    sesionesMock.crearSesionRevision.mockResolvedValue({ id: "s1", threadId: "t1" });
  });

  it("GET sin auth → 401", async () => {
    expertoMock.getExperto.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/revision/sesiones"));
    expect(response.status).toBe(401);
  });

  it("GET default excluye borradores", async () => {
    await GET(new Request("http://localhost/api/revision/sesiones"));
    expect(sesionesMock.listarSesionesRevision).toHaveBeenCalledWith({ incluirBorradores: false });
  });

  it("GET ?borradores=1 los incluye", async () => {
    await GET(new Request("http://localhost/api/revision/sesiones?borradores=1"));
    expect(sesionesMock.listarSesionesRevision).toHaveBeenCalledWith({ incluirBorradores: true });
  });

  it("POST con origen autonoma lo pasa a la creación", async () => {
    const response = await POST(postRequest({ titulo: "[escenario] x", origen: "autonoma" }));
    expect(response.status).toBe(201);
    expect(sesionesMock.crearSesionRevision).toHaveBeenCalledWith({
      titulo: "[escenario] x",
      creadaPor: "Dra. García",
      origen: "autonoma",
    });
  });

  it("POST sin origen crea sesión de experto (origen undefined)", async () => {
    await POST(postRequest({ titulo: "Sesión" }));
    expect(sesionesMock.crearSesionRevision).toHaveBeenCalledWith({
      titulo: "Sesión",
      creadaPor: "Dra. García",
      origen: undefined,
    });
  });

  it("POST con origen inválido → 400", async () => {
    const response = await POST(postRequest({ origen: "humano" }));
    expect(response.status).toBe(400);
  });
});
```

`frontend/src/app/api/revision/sesiones/[id]/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const expertoMock = vi.hoisted(() => ({ getExperto: vi.fn() }));
vi.mock("@/lib/revision/experto-cookie", () => expertoMock);

const sesionesMock = vi.hoisted(() => ({
  getSesionRevision: vi.fn(),
  publicarSesionRevision: vi.fn(),
  getCasoDeSesion: vi.fn(),
}));
vi.mock("@/lib/revision/sesiones", () => sesionesMock);

const notasMock = vi.hoisted(() => ({ listarNotasDeSesion: vi.fn() }));
vi.mock("@/lib/revision/notas", () => notasMock);

const timelineMock = vi.hoisted(() => ({ construirTimeline: vi.fn() }));
vi.mock("@/lib/revision/timeline", () => timelineMock);

import { GET, PATCH } from "./route";

const params = { params: Promise.resolve({ id: "s1" }) };

function patchRequest(body: unknown): Request {
  return new Request("http://localhost/api/revision/sesiones/s1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/revision/sesiones/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expertoMock.getExperto.mockResolvedValue({ nombre: "Dra. García" });
    sesionesMock.getSesionRevision.mockResolvedValue({
      id: "s1",
      sessionId: "ss1",
      threadId: "t1",
      titulo: "[escenario] divorcio",
      creadaPor: "Asistente técnico",
      origenRevision: "AUTONOMA",
      borrador: true,
    });
    sesionesMock.getCasoDeSesion.mockResolvedValue({ estado: "CAPTADO" });
    sesionesMock.publicarSesionRevision.mockResolvedValue(true);
    notasMock.listarNotasDeSesion.mockResolvedValue([]);
    timelineMock.construirTimeline.mockResolvedValue([]);
  });

  it("GET incluye caso y campos de origen de la sesión", async () => {
    const response = await GET(new Request("http://localhost/api/revision/sesiones/s1"), params);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      sesion: { origenRevision: string; borrador: boolean };
      caso: { estado: string } | null;
    };
    expect(payload.sesion.origenRevision).toBe("AUTONOMA");
    expect(payload.sesion.borrador).toBe(true);
    expect(payload.caso).toEqual({ estado: "CAPTADO" });
    expect(sesionesMock.getCasoDeSesion).toHaveBeenCalledWith("s1");
  });

  it("PATCH publica la sesión", async () => {
    const response = await PATCH(patchRequest({ borrador: false }), params);
    expect(response.status).toBe(200);
    expect(sesionesMock.publicarSesionRevision).toHaveBeenCalledWith("s1");
  });

  it("PATCH sobre sesión inexistente o ya publicada → 404", async () => {
    sesionesMock.publicarSesionRevision.mockResolvedValue(false);
    const response = await PATCH(patchRequest({ borrador: false }), params);
    expect(response.status).toBe(404);
  });

  it("PATCH con body inválido → 400", async () => {
    const response = await PATCH(patchRequest({ borrador: true }), params);
    expect(response.status).toBe(400);
  });

  it("PATCH sin auth → 401", async () => {
    expertoMock.getExperto.mockResolvedValue(null);
    const response = await PATCH(patchRequest({ borrador: false }), params);
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd frontend && pnpm test:unit -- --run src/app/api/revision/sesiones`
Expected: FAIL (`PATCH` no exportado; `listarSesionesRevision` llamada sin argumento; `getCasoDeSesion` inexistente).

- [ ] **Step 3: Extender validations**

En `frontend/src/lib/validations/revision.ts`, reemplazar `crearSesionSchema` y agregar el de publicación:

```typescript
export const crearSesionSchema = z.object({
  titulo: z.string().trim().min(1).max(120).optional(),
  /** "autonoma" = corrida del runner de escenarios; ausente = sesión de experto. */
  origen: z.literal("autonoma").optional(),
});
export type CrearSesionInput = z.infer<typeof crearSesionSchema>;

export const publicarSesionSchema = z.object({
  borrador: z.literal(false),
});
export type PublicarSesionInput = z.infer<typeof publicarSesionSchema>;
```

- [ ] **Step 4: Extender la lib de sesiones**

`frontend/src/lib/revision/sesiones.ts` — `SesionResumen` pasa a:

```typescript
export interface SesionResumen {
  id: string;
  titulo: string | null;
  creadaPor: string | null;
  origenRevision: "EXPERTO" | "AUTONOMA" | null;
  borrador: boolean;
  actualizadaEn: string;
  notasAbiertas: number;
  notasRespondidas: number;
}
```

`crearSesionRevision` pasa a:

```typescript
export async function crearSesionRevision(params: {
  titulo?: string;
  creadaPor: string;
  origen?: "autonoma" | undefined;
}): Promise<{ id: string; threadId: string }> {
  const sessionId = randomUUID();
  const esAutonoma = params.origen === "autonoma";
  return prisma.conversation.create({
    data: {
      sessionId,
      threadId: threadIdForSession(sessionId),
      esRevision: true,
      titulo: params.titulo ?? null,
      creadaPor: params.creadaPor,
      origenRevision: esAutonoma ? "AUTONOMA" : "EXPERTO",
      // Las corridas autónomas nacen fuera del listado compartido (spec §1).
      borrador: esAutonoma,
    },
    select: { id: true, threadId: true },
  });
}
```

`listarSesionesRevision` pasa a:

```typescript
export async function listarSesionesRevision(options?: { incluirBorradores?: boolean }): Promise<SesionResumen[]> {
  const sesiones = await prisma.conversation.findMany({
    where: { esRevision: true, ...(options?.incluirBorradores ? {} : { borrador: false }) },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      titulo: true,
      creadaPor: true,
      origenRevision: true,
      borrador: true,
      updatedAt: true,
      notas: { select: { estado: true } },
    },
  });
  return sesiones.map((sesion) => ({
    id: sesion.id,
    titulo: sesion.titulo,
    creadaPor: sesion.creadaPor,
    origenRevision: sesion.origenRevision,
    borrador: sesion.borrador,
    actualizadaEn: sesion.updatedAt.toISOString(),
    notasAbiertas: sesion.notas.filter((nota) => nota.estado === "ABIERTA").length,
    notasRespondidas: sesion.notas.filter((nota) => nota.estado === "RESPONDIDA").length,
  }));
}
```

`getSesionRevision` suma los dos campos al select y al tipo de retorno:

```typescript
export async function getSesionRevision(id: string): Promise<{
  id: string;
  sessionId: string;
  threadId: string;
  titulo: string | null;
  creadaPor: string | null;
  origenRevision: "EXPERTO" | "AUTONOMA" | null;
  borrador: boolean;
} | null> {
  return prisma.conversation.findFirst({
    where: { id, esRevision: true },
    select: {
      id: true,
      sessionId: true,
      threadId: true,
      titulo: true,
      creadaPor: true,
      origenRevision: true,
      borrador: true,
    },
  });
}
```

Y al final del archivo, las dos funciones nuevas:

```typescript
/** Publica una corrida autónoma: sale de borrador y entra al listado compartido. */
export async function publicarSesionRevision(id: string): Promise<boolean> {
  const result = await prisma.conversation.updateMany({
    where: { id, esRevision: true, borrador: true },
    data: { borrador: false },
  });
  return result.count === 1;
}

export interface CasoSnapshot {
  estado: string;
  categoria: string | null;
  subcategorias: string[];
  resumen: unknown;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  eventos: { tipo: string; payload: unknown; createdAt: string }[];
}

/**
 * Snapshot del Caso de una sesión (el id de la sesión ES el Conversation.id).
 * Alimenta el reporte del runner de escenarios y deja el dato disponible
 * para la UI de revisión.
 */
export async function getCasoDeSesion(conversationId: string): Promise<CasoSnapshot | null> {
  const caso = await prisma.caso.findUnique({
    where: { conversationId },
    include: { eventos: { orderBy: { createdAt: "asc" } } },
  });
  if (!caso) return null;
  return {
    estado: caso.estado,
    categoria: caso.categoria,
    subcategorias: caso.subcategorias,
    resumen: caso.resumen,
    contactoNombre: caso.contactoNombre,
    contactoTelefono: caso.contactoTelefono,
    contactoEmail: caso.contactoEmail,
    eventos: caso.eventos.map((evento) => ({
      tipo: evento.tipo,
      payload: evento.payload,
      createdAt: evento.createdAt.toISOString(),
    })),
  };
}
```

- [ ] **Step 5: Extender las rutas**

`frontend/src/app/api/revision/sesiones/route.ts` — `GET` toma el request y lee el query param; `POST` propaga `origen`:

```typescript
export async function GET(request: Request) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const incluirBorradores = new URL(request.url).searchParams.get("borradores") === "1";
    return NextResponse.json({ sesiones: await listarSesionesRevision({ incluirBorradores }) });
  } catch (error) {
    logger.error("revision/sesiones GET failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

En `POST`, la creación pasa a:

```typescript
    const sesion = await crearSesionRevision({
      titulo: validation.data.titulo,
      creadaPor: experto.nombre,
      origen: validation.data.origen,
    });
```

`frontend/src/app/api/revision/sesiones/[id]/route.ts` — el `GET` suma `caso` y los campos nuevos (imports: agregar `getCasoDeSesion` y `publicarSesionRevision` de `@/lib/revision/sesiones`, y `parseRequestBody`, `publicarSesionSchema` de `@/lib/validations`):

```typescript
    const [timeline, notas, caso] = await Promise.all([
      construirTimeline(sesion.threadId),
      listarNotasDeSesion(sesion.id),
      getCasoDeSesion(sesion.id),
    ]);
    return NextResponse.json({
      sesion: {
        id: sesion.id,
        titulo: sesion.titulo,
        creadaPor: sesion.creadaPor,
        origenRevision: sesion.origenRevision,
        borrador: sesion.borrador,
      },
      timeline,
      notas,
      caso,
    });
```

Y el `PATCH` nuevo al final del archivo:

```typescript
/** Publicar una corrida autónoma (borrador → listado compartido). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const experto = await getExperto();
    if (!experto) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const validation = await parseRequestBody(request, publicarSesionSchema);
    if (!validation.success) return validation.response;

    const publicada = await publicarSesionRevision(id);
    if (!publicada) return NextResponse.json({ error: "Sesión no encontrada o ya publicada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("revision/sesiones/:id PATCH failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Verificar que pasan todos**

Run: `cd frontend && pnpm test:unit -- --run src/app/api/revision`
Expected: PASS (los tests nuevos + los de acceso existentes).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/validations/revision.ts frontend/src/lib/revision/sesiones.ts "frontend/src/app/api/revision/sesiones"
git commit -m "feat(revision): sesiones autónomas borrador, caso en el detalle y PATCH publicar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Badge de origen en el listado (TDD)

**Files:**
- Modify: `frontend/src/components/revision/ListadoSesiones.tsx`
- Modify: `frontend/src/components/revision/revision.module.css` (junto a `.badgeRespondida`, ~línea 271)
- Test (create): `frontend/src/components/revision/ListadoSesiones.test.tsx`

**Interfaces:**
- Consumes: `SesionResumen` de Task 2 (con `origenRevision` y `borrador`).
- Produces: nada consumido por otras tasks (hoja del árbol).

- [ ] **Step 1: Escribir el test del componente (falla)**

`frontend/src/components/revision/ListadoSesiones.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SesionResumen } from "@/lib/revision/sesiones";

import { ListadoSesiones } from "./ListadoSesiones";

function sesion(overrides: Partial<SesionResumen>): SesionResumen {
  return {
    id: "s1",
    titulo: "Sesión",
    creadaPor: "Dra. García",
    origenRevision: "EXPERTO",
    borrador: false,
    actualizadaEn: "2026-07-22T12:00:00.000Z",
    notasAbiertas: 0,
    notasRespondidas: 0,
    ...overrides,
  };
}

describe("ListadoSesiones", () => {
  it("sesión autónoma muestra el badge de origen", () => {
    render(
      <ListadoSesiones
        sesiones={[sesion({ id: "a1", origenRevision: "AUTONOMA", creadaPor: "Asistente técnico" })]}
        onAbrir={vi.fn()}
        onCrear={vi.fn()}
      />,
    );
    expect(screen.getByText("Generada por el asistente técnico")).toBeInTheDocument();
  });

  it("sesión de experto no muestra el badge", () => {
    render(<ListadoSesiones sesiones={[sesion({})]} onAbrir={vi.fn()} onCrear={vi.fn()} />);
    expect(screen.queryByText("Generada por el asistente técnico")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && pnpm test:unit -- --run src/components/revision/ListadoSesiones`
Expected: FAIL — el badge no existe todavía.

- [ ] **Step 3: Agregar badge y estilo**

En `ListadoSesiones.tsx`, dentro del `<span className={styles.badges}>`, antes del badge de abiertas:

```tsx
                {sesion.origenRevision === "AUTONOMA" ? (
                  <span className={styles.badgeAutonoma}>Generada por el asistente técnico</span>
                ) : null}
```

En `revision.module.css`, después de `.badgeRespondida`:

```css
.badgeAutonoma {
  background: color-mix(in srgb, var(--ink-500) 12%, var(--surface));
  color: var(--ink-500);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--text-xs);
  font-weight: 600;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd frontend && pnpm test:unit -- --run src/components/revision/ListadoSesiones`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/revision
git commit -m "feat(revision): badge de origen autónomo en el listado de sesiones

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Lib pura de escenarios (schema, expectativas, reporte — TDD)

**Files:**
- Create: `frontend/src/lib/escenarios/schema.ts`
- Create: `frontend/src/lib/escenarios/expectativas.ts`
- Create: `frontend/src/lib/escenarios/reporte-markdown.ts`
- Test (create): `frontend/src/lib/escenarios/schema.test.ts`
- Test (create): `frontend/src/lib/escenarios/expectativas.test.ts`
- Test (create): `frontend/src/lib/escenarios/reporte-markdown.test.ts`

**Interfaces:**
- Produces (Task 5 los importa con paths relativos):
  - `escenarioSchema` (Zod) y tipos `Escenario`, `Expectativas`.
  - Tipos de corrida: `Corrida`, `TurnoCorrida`, `ToolCallCorrida`, `CasoCorrida`, `ExpectativaResultado`.
  - `evaluarExpectativas(expectativas, turnos, caso): ExpectativaResultado[]`.
  - `renderCorridaMarkdown(corrida): string`.
- Sin imports de `server-only` ni de Prisma: módulos puros (los consume el CLI vía tsx).

- [ ] **Step 1: Escribir `schema.ts`** (los tipos van primero porque los tests de los otros módulos los usan)

```typescript
import { z } from "zod";

/**
 * Contrato de un escenario reproducible (frontend/escenarios/<slug>.json).
 * La persona es la base para improvisar turnos en personaje; los turnos son
 * el guion base reproducible (spec 2026-07-22-sistema-escenarios-reproducibles §2).
 */
export const expectativasSchema = z.object({
  clasificacion: z
    .object({ categoria: z.string().min(1), subcategoria: z.string().min(1).optional() })
    .optional(),
  llamoBuscarDocumentos: z.boolean().optional(),
  casoCaptado: z.boolean().optional(),
  contactoRegistrado: z.boolean().optional(),
});
export type Expectativas = z.infer<typeof expectativasSchema>;

export const escenarioSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  persona: z.string().min(1),
  turnos: z.array(z.string().min(1)).min(1),
  expectativas: expectativasSchema.optional(),
});
export type Escenario = z.infer<typeof escenarioSchema>;

export interface ToolCallCorrida {
  toolName: string;
  args: Record<string, unknown>;
}

export interface TurnoCorrida {
  n: number;
  origen: "guion" | "improvisado";
  usuario: string;
  respuesta: string;
  toolCalls: ToolCallCorrida[];
  latenciaPrimerByteMs: number;
  latenciaTotalMs: number;
  error?: string;
}

/** Snapshot del Caso que devuelve GET /api/revision/sesiones/:id. */
export interface CasoCorrida {
  estado: string;
  categoria: string | null;
  subcategorias: string[];
  resumen: unknown;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  eventos: { tipo: string; payload: unknown; createdAt: string }[];
}

export interface ExpectativaResultado {
  clave: string;
  esperado: unknown;
  obtenido: unknown;
  cumplida: boolean;
}

/** El sesionId ES el Conversation.id (misma fila). */
export interface Corrida {
  escenario: string;
  titulo: string;
  url: string;
  sesionId: string;
  inicio: string;
  turnos: TurnoCorrida[];
  expectativas: ExpectativaResultado[];
  caso: CasoCorrida | null;
}
```

- [ ] **Step 2: Escribir los tests de los tres módulos (los de expectativas y reporte fallan)**

`frontend/src/lib/escenarios/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { escenarioSchema } from "./schema";

const valido = {
  titulo: "Divorcio con hijos",
  persona: "Mariana, 38, dos hijos.",
  turnos: ["me quiero divorciar"],
};

describe("escenarioSchema", () => {
  it("acepta un escenario mínimo válido", () => {
    expect(escenarioSchema.parse(valido)).toMatchObject({ titulo: "Divorcio con hijos" });
  });

  it("rechaza escenario sin persona", () => {
    expect(escenarioSchema.safeParse({ ...valido, persona: undefined }).success).toBe(false);
  });

  it("rechaza guion vacío", () => {
    expect(escenarioSchema.safeParse({ ...valido, turnos: [] }).success).toBe(false);
  });

  it("rechaza expectativa desconocida en clasificacion", () => {
    const conExpectativas = { ...valido, expectativas: { clasificacion: { categoria: "" } } };
    expect(escenarioSchema.safeParse(conExpectativas).success).toBe(false);
  });
});
```

`frontend/src/lib/escenarios/expectativas.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { evaluarExpectativas } from "./expectativas";
import type { CasoCorrida, TurnoCorrida } from "./schema";

function turno(toolCalls: TurnoCorrida["toolCalls"]): TurnoCorrida {
  return {
    n: 1,
    origen: "guion",
    usuario: "hola",
    respuesta: "…",
    toolCalls,
    latenciaPrimerByteMs: 100,
    latenciaTotalMs: 500,
  };
}

const casoCaptado: CasoCorrida = {
  estado: "CAPTADO",
  categoria: "familia",
  subcategorias: ["divorcio-sociedad-conyugal"],
  resumen: null,
  contactoNombre: "Mariana Techera",
  contactoTelefono: null,
  contactoEmail: null,
  eventos: [],
};

describe("evaluarExpectativas", () => {
  it("sin expectativas declaradas devuelve vacío", () => {
    expect(evaluarExpectativas(undefined, [turno([])], null)).toEqual([]);
  });

  it("clasificacion cumplida cuando asignar-clasificacion coincide", () => {
    const turnos = [
      turno([{ toolName: "asignar-clasificacion", args: { categoria: "familia", subcategoria: "divorcio-sociedad-conyugal" } }]),
    ];
    const [resultado] = evaluarExpectativas(
      { clasificacion: { categoria: "familia", subcategoria: "divorcio-sociedad-conyugal" } },
      turnos,
      null,
    );
    expect(resultado?.cumplida).toBe(true);
  });

  it("clasificacion incumplida sin tool-call de clasificación", () => {
    const [resultado] = evaluarExpectativas({ clasificacion: { categoria: "familia" } }, [turno([])], null);
    expect(resultado?.cumplida).toBe(false);
    expect(resultado?.obtenido).toBeNull();
  });

  it("llamoBuscarDocumentos busca en todos los turnos", () => {
    const turnos = [turno([]), turno([{ toolName: "buscar-documentos", args: { consulta: "divorcio" } }])];
    const [resultado] = evaluarExpectativas({ llamoBuscarDocumentos: true }, turnos, null);
    expect(resultado?.cumplida).toBe(true);
  });

  it("casoCaptado y contactoRegistrado leen el snapshot del caso", () => {
    const resultados = evaluarExpectativas({ casoCaptado: true, contactoRegistrado: true }, [turno([])], casoCaptado);
    expect(resultados.map((resultado) => resultado.cumplida)).toEqual([true, true]);
  });

  it("contactoRegistrado incumplida sin caso", () => {
    const [resultado] = evaluarExpectativas({ contactoRegistrado: true }, [turno([])], null);
    expect(resultado?.cumplida).toBe(false);
  });
});
```

`frontend/src/lib/escenarios/reporte-markdown.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { renderCorridaMarkdown } from "./reporte-markdown";
import type { Corrida } from "./schema";

const corrida: Corrida = {
  escenario: "divorcio-con-hijos-visitas",
  titulo: "Divorcio con hijos",
  url: "http://localhost:3000",
  sesionId: "s1",
  inicio: "2026-07-22T19:00:00.000Z",
  turnos: [
    {
      n: 1,
      origen: "guion",
      usuario: "me quiero divorciar",
      respuesta: "Entiendo tu situación…",
      toolCalls: [{ toolName: "asignar-clasificacion", args: { categoria: "familia" } }],
      latenciaPrimerByteMs: 800,
      latenciaTotalMs: 9000,
    },
    {
      n: 2,
      origen: "improvisado",
      usuario: "nos casamos en 2015",
      respuesta: "Gracias…",
      toolCalls: [],
      latenciaPrimerByteMs: 700,
      latenciaTotalMs: 4000,
    },
  ],
  expectativas: [{ clave: "casoCaptado", esperado: true, obtenido: false, cumplida: false }],
  caso: null,
};

describe("renderCorridaMarkdown", () => {
  it("incluye transcript, tool-calls, origen del turno y expectativas", () => {
    const markdown = renderCorridaMarkdown(corrida);
    expect(markdown).toContain("me quiero divorciar");
    expect(markdown).toContain("asignar-clasificacion");
    expect(markdown).toContain("Turno 2 (improvisado)");
    expect(markdown).toContain("| casoCaptado | true | false | INCUMPLIDA |");
    expect(markdown).toContain("(sin caso registrado)");
  });
});
```

- [ ] **Step 3: Verificar estado**

Run: `cd frontend && pnpm test:unit -- --run src/lib/escenarios`
Expected: `schema.test.ts` PASS; los otros dos FAIL (módulos inexistentes).

- [ ] **Step 4: Implementar `expectativas.ts`**

```typescript
import type { CasoCorrida, ExpectativaResultado, Expectativas, TurnoCorrida } from "./schema";

/**
 * Evalúa las expectativas declaradas del escenario contra la corrida.
 * Informativo, nunca gate: el resultado se reporta, no corta nada
 * (el gate de regresión del proyecto es pnpm evals).
 */
export function evaluarExpectativas(
  expectativas: Expectativas | undefined,
  turnos: TurnoCorrida[],
  caso: CasoCorrida | null,
): ExpectativaResultado[] {
  if (!expectativas) return [];
  const resultados: ExpectativaResultado[] = [];
  const toolCalls = turnos.flatMap((turno) => turno.toolCalls);

  if (expectativas.clasificacion) {
    const esperado = expectativas.clasificacion;
    const asignacion = toolCalls.find((call) => call.toolName === "asignar-clasificacion");
    const obtenido = asignacion
      ? { categoria: asignacion.args.categoria, subcategoria: asignacion.args.subcategoria }
      : null;
    const cumplida =
      obtenido !== null &&
      obtenido.categoria === esperado.categoria &&
      (esperado.subcategoria === undefined || obtenido.subcategoria === esperado.subcategoria);
    resultados.push({ clave: "clasificacion", esperado, obtenido, cumplida });
  }
  if (expectativas.llamoBuscarDocumentos !== undefined) {
    const obtenido = toolCalls.some((call) => call.toolName === "buscar-documentos");
    resultados.push({
      clave: "llamoBuscarDocumentos",
      esperado: expectativas.llamoBuscarDocumentos,
      obtenido,
      cumplida: obtenido === expectativas.llamoBuscarDocumentos,
    });
  }
  if (expectativas.casoCaptado !== undefined) {
    const obtenido = caso?.estado === "CAPTADO";
    resultados.push({
      clave: "casoCaptado",
      esperado: expectativas.casoCaptado,
      obtenido,
      cumplida: obtenido === expectativas.casoCaptado,
    });
  }
  if (expectativas.contactoRegistrado !== undefined) {
    const obtenido = Boolean(caso && (caso.contactoNombre ?? caso.contactoTelefono ?? caso.contactoEmail));
    resultados.push({
      clave: "contactoRegistrado",
      esperado: expectativas.contactoRegistrado,
      obtenido,
      cumplida: obtenido === expectativas.contactoRegistrado,
    });
  }
  return resultados;
}
```

- [ ] **Step 5: Implementar `reporte-markdown.ts`**

```typescript
import type { Corrida } from "./schema";

/** Render legible de una corrida (el .json es la fuente de análisis). */
export function renderCorridaMarkdown(corrida: Corrida): string {
  const lineas: string[] = [
    `# Corrida — ${corrida.titulo}`,
    "",
    `- Escenario: \`${corrida.escenario}\``,
    `- Entorno: ${corrida.url}`,
    `- Sesión: ${corrida.sesionId}`,
    `- Inicio: ${corrida.inicio}`,
    "",
  ];
  for (const turno of corrida.turnos) {
    lineas.push(`## Turno ${String(turno.n)} (${turno.origen})`, "", `**Usuario:** ${turno.usuario}`, "");
    for (const call of turno.toolCalls) {
      lineas.push(`- tool \`${call.toolName}\` → \`${JSON.stringify(call.args)}\``);
    }
    if (turno.toolCalls.length > 0) lineas.push("");
    lineas.push(`**Asistente:** ${turno.respuesta}`, "");
    if (turno.error !== undefined) lineas.push(`**Error del turno:** ${turno.error}`, "");
    lineas.push(
      `_Latencia: primer byte ${String(turno.latenciaPrimerByteMs)} ms · total ${String(turno.latenciaTotalMs)} ms_`,
      "",
    );
  }
  lineas.push("## Expectativas", "");
  if (corrida.expectativas.length === 0) {
    lineas.push("(sin expectativas declaradas)", "");
  } else {
    lineas.push("| Clave | Esperado | Obtenido | Resultado |", "|---|---|---|---|");
    for (const resultado of corrida.expectativas) {
      lineas.push(
        `| ${resultado.clave} | ${JSON.stringify(resultado.esperado)} | ${JSON.stringify(resultado.obtenido)} | ${resultado.cumplida ? "CUMPLIDA" : "INCUMPLIDA"} |`,
      );
    }
    lineas.push("");
  }
  lineas.push("## Caso", "");
  if (corrida.caso === null) {
    lineas.push("(sin caso registrado)", "");
  } else {
    lineas.push("```json", JSON.stringify(corrida.caso, null, 2), "```", "");
  }
  return lineas.join("\n");
}
```

- [ ] **Step 6: Verificar que pasan**

Run: `cd frontend && pnpm test:unit -- --run src/lib/escenarios`
Expected: PASS (3 archivos).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/escenarios
git commit -m "feat(escenarios): schema Zod, evaluador de expectativas y reporte markdown

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Runner CLI + escenario de ejemplo

**Files:**
- Create: `frontend/scripts/escenario/cliente.ts`
- Create: `frontend/scripts/escenario/corridas.ts`
- Create: `frontend/scripts/escenario.ts`
- Create: `frontend/escenarios/divorcio-con-hijos-visitas.json`
- Modify: `frontend/package.json` (scripts)
- Modify: `frontend/.gitignore`

**Interfaces:**
- Consumes: Task 4 (`escenarioSchema`, `evaluarExpectativas`, `renderCorridaMarkdown`, tipos) vía imports relativos `../../src/lib/escenarios/*`; Task 2 (endpoints HTTP); `createSseLineSplitter`/`parseSseData` de `../../src/utils/sse`.
- Produces: comandos `pnpm escenario correr <slug> [--url --clave --publicar]` · `continuar <sesionId> --mensaje "…"` · `publicar <sesionId>` · `listar [--borradores]`. Reportes en `frontend/escenarios/corridas/<slug>/<timestamp>.{json,md}` (gitignorados).
- Sin unit tests (IO puro sobre lógica ya testeada en Task 4); la verificación es typecheck + lint + el mensaje de uso.

- [ ] **Step 1: Escribir `scripts/escenario/cliente.ts`**

```typescript
/**
 * Cliente HTTP del runner contra los endpoints de /revision. HTTP puro:
 * funciona contra cualquier entorno con la clave correcta, sin DATABASE_URL
 * ni server local. Sin imports server-only.
 */
import type { CasoCorrida, ToolCallCorrida } from "../../src/lib/escenarios/schema";
import { createSseLineSplitter, parseSseData } from "../../src/utils/sse";

export interface RespuestaTurno {
  respuesta: string;
  toolCalls: ToolCallCorrida[];
  latenciaPrimerByteMs: number;
  latenciaTotalMs: number;
  error?: string;
}

export interface SesionListado {
  id: string;
  titulo: string | null;
  creadaPor: string | null;
  origenRevision: "EXPERTO" | "AUTONOMA" | null;
  borrador: boolean;
  actualizadaEn: string;
}

export class ClienteRevision {
  private cookie = "";

  constructor(
    private readonly baseUrl: string,
    private readonly clave: string,
  ) {}

  async autenticar(nombre: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/revision/acceso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: this.clave, nombre }),
    });
    if (!response.ok) {
      throw new Error(`Acceso a revisión falló (${String(response.status)}): ¿clave correcta para ${this.baseUrl}?`);
    }
    const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith("ls_experto="));
    if (!setCookie) throw new Error("El acceso no devolvió la cookie de experto");
    this.cookie = setCookie.split(";")[0] ?? "";
  }

  async crearSesion(titulo: string): Promise<{ id: string }> {
    const payload = await this.json("POST", "/api/revision/sesiones", { titulo, origen: "autonoma" });
    return (payload as { sesion: { id: string } }).sesion;
  }

  async publicar(sesionId: string): Promise<void> {
    await this.json("PATCH", `/api/revision/sesiones/${sesionId}`, { borrador: false });
  }

  async listarSesiones(incluirBorradores: boolean): Promise<SesionListado[]> {
    const query = incluirBorradores ? "?borradores=1" : "";
    const payload = await this.json("GET", `/api/revision/sesiones${query}`);
    return (payload as { sesiones: SesionListado[] }).sesiones;
  }

  async getCaso(sesionId: string): Promise<CasoCorrida | null> {
    const payload = await this.json("GET", `/api/revision/sesiones/${sesionId}`);
    return (payload as { caso: CasoCorrida | null }).caso;
  }

  /** Turno de chat: SSE con texto, tool-calls y latencias. 429 → espera y reintenta una vez. */
  async mandarMensaje(sesionId: string, message: string): Promise<RespuestaTurno> {
    const inicio = Date.now();
    let response = await this.fetchMensaje(sesionId, message);
    if (response.status === 429) {
      const espera = Number(response.headers.get("retry-after") ?? "60");
      process.stdout.write(`Rate limit del entorno: esperando ${String(espera)}s antes de reintentar…\n`);
      await new Promise((resolve) => setTimeout(resolve, espera * 1000));
      response = await this.fetchMensaje(sesionId, message);
    }
    if (!response.ok || !response.body) {
      return {
        respuesta: "",
        toolCalls: [],
        latenciaPrimerByteMs: 0,
        latenciaTotalMs: Date.now() - inicio,
        error: `HTTP ${String(response.status)}`,
      };
    }

    const splitter = createSseLineSplitter();
    const decoder = new TextDecoder();
    const toolCalls: ToolCallCorrida[] = [];
    let primerByteMs = 0;
    let texto = "";
    let error: string | undefined;
    for await (const chunk of response.body) {
      if (primerByteMs === 0) primerByteMs = Date.now() - inicio;
      for (const data of splitter(decoder.decode(chunk, { stream: true }))) {
        const event = parseSseData(data);
        if (!event) continue;
        if (event.kind === "text") texto += event.text;
        else if (event.kind === "tool-call") toolCalls.push({ toolName: event.toolName, args: event.args });
        else error = event.message;
      }
    }
    return {
      respuesta: texto,
      toolCalls,
      latenciaPrimerByteMs: primerByteMs,
      latenciaTotalMs: Date.now() - inicio,
      ...(error === undefined ? {} : { error }),
    };
  }

  private fetchMensaje(sesionId: string, message: string): Promise<Response> {
    return fetch(`${this.baseUrl}/api/revision/sesiones/${sesionId}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: this.cookie },
      body: JSON.stringify({ message }),
    });
  }

  private async json(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: this.cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`${method} ${path} → HTTP ${String(response.status)}`);
    return response.json();
  }
}
```

- [ ] **Step 2: Escribir `scripts/escenario/corridas.ts`**

```typescript
/** Lectura de escenarios y persistencia de corridas (JSON fuente + MD legible). */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { renderCorridaMarkdown } from "../../src/lib/escenarios/reporte-markdown";
import { escenarioSchema } from "../../src/lib/escenarios/schema";
import type { Corrida, Escenario } from "../../src/lib/escenarios/schema";

// El script corre vía pnpm desde frontend/ — cwd estable (mismo criterio que
// scripts/feedback-pull.ts).
const RAIZ = path.resolve(process.cwd(), "escenarios");

export function leerEscenario(slug: string): Escenario {
  const ruta = path.join(RAIZ, `${slug}.json`);
  if (!existsSync(ruta)) throw new Error(`No existe el escenario "${slug}" (${ruta})`);
  return escenarioSchema.parse(JSON.parse(readFileSync(ruta, "utf8")));
}

/** Escribe <base>.json y <base>.md; devuelve la base (sin extensión). */
export function guardarCorrida(corrida: Corrida, base?: string): string {
  const dir = path.join(RAIZ, "corridas", corrida.escenario);
  mkdirSync(dir, { recursive: true });
  const archivoBase = base ?? path.join(dir, corrida.inicio.replaceAll(":", "-"));
  writeFileSync(`${archivoBase}.json`, JSON.stringify(corrida, null, 2), "utf8");
  writeFileSync(`${archivoBase}.md`, renderCorridaMarkdown(corrida), "utf8");
  return archivoBase;
}

/** Busca la corrida local de una sesión (para `continuar`). */
export function localizarCorrida(sesionId: string): { corrida: Corrida; base: string } | null {
  const dirCorridas = path.join(RAIZ, "corridas");
  if (!existsSync(dirCorridas)) return null;
  for (const entrada of readdirSync(dirCorridas, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    const dirSlug = path.join(dirCorridas, entrada.name);
    for (const archivo of readdirSync(dirSlug).filter((nombre) => nombre.endsWith(".json"))) {
      const ruta = path.join(dirSlug, archivo);
      const corrida = JSON.parse(readFileSync(ruta, "utf8")) as Corrida;
      if (corrida.sesionId === sesionId) return { corrida, base: ruta.slice(0, -".json".length) };
    }
  }
  return null;
}
```

- [ ] **Step 3: Escribir `scripts/escenario.ts`**

```typescript
/**
 * Runner de escenarios reproducibles (spec docs/plans/2026-07-22-sistema-
 * escenarios-reproducibles.md). Corre conversaciones guionadas contra los
 * endpoints de /revision del entorno objetivo (default: prod) y deja el
 * reporte en escenarios/corridas/. Proceso de uso: skill reproducir-escenario.
 */
import "dotenv/config";

import { parseArgs } from "node:util";

import { evaluarExpectativas } from "../src/lib/escenarios/expectativas";
import type { Corrida } from "../src/lib/escenarios/schema";
import { ClienteRevision } from "./escenario/cliente";
import { guardarCorrida, leerEscenario, localizarCorrida } from "./escenario/corridas";

const URL_DEFAULT = "https://frontend-production-1293.up.railway.app";
const NOMBRE_RUNNER = "Asistente técnico";
const USO = `Uso:
  pnpm escenario correr <slug> [--url <base>] [--clave <clave>] [--publicar]
  pnpm escenario continuar <sesionId> --mensaje "..." [--url] [--clave]
  pnpm escenario publicar <sesionId> [--url] [--clave]
  pnpm escenario listar [--borradores] [--url] [--clave]
`;

async function correr(cliente: ClienteRevision, url: string, slug: string, publicarAlFinal: boolean): Promise<void> {
  const escenario = leerEscenario(slug);
  await cliente.autenticar(NOMBRE_RUNNER);
  const inicio = new Date().toISOString();
  const sesion = await cliente.crearSesion(`[escenario] ${slug} — ${inicio}`);
  process.stdout.write(`Sesión ${sesion.id} creada (borrador) en ${url}\n`);
  const corrida: Corrida = {
    escenario: slug,
    titulo: escenario.titulo,
    url,
    sesionId: sesion.id,
    inicio,
    turnos: [],
    expectativas: [],
    caso: null,
  };
  try {
    for (const [indice, mensaje] of escenario.turnos.entries()) {
      process.stdout.write(`Turno ${String(indice + 1)}/${String(escenario.turnos.length)}…\n`);
      const resultado = await cliente.mandarMensaje(sesion.id, mensaje);
      corrida.turnos.push({ n: indice + 1, origen: "guion", usuario: mensaje, ...resultado });
      if (resultado.error !== undefined) {
        process.stderr.write(`Turno con error (${resultado.error}) — corto la corrida.\n`);
        break;
      }
    }
  } finally {
    corrida.caso = await cliente.getCaso(sesion.id).catch(() => null);
    corrida.expectativas = evaluarExpectativas(escenario.expectativas, corrida.turnos, corrida.caso);
    const base = guardarCorrida(corrida);
    const incumplidas = corrida.expectativas.filter((expectativa) => !expectativa.cumplida);
    process.stdout.write(`Reporte: ${base}.md\n`);
    if (incumplidas.length > 0) {
      process.stdout.write(`Expectativas incumplidas: ${incumplidas.map((expectativa) => expectativa.clave).join(", ")}\n`);
    }
  }
  if (publicarAlFinal) {
    await cliente.publicar(sesion.id);
    process.stdout.write("Corrida publicada al listado del equipo legal.\n");
  }
}

async function continuar(cliente: ClienteRevision, sesionId: string, mensaje: string): Promise<void> {
  const localizada = localizarCorrida(sesionId);
  if (!localizada) throw new Error(`No hay corrida local para la sesión ${sesionId} en escenarios/corridas/`);
  const { corrida, base } = localizada;
  const escenario = leerEscenario(corrida.escenario);
  await cliente.autenticar(NOMBRE_RUNNER);
  const resultado = await cliente.mandarMensaje(sesionId, mensaje);
  corrida.turnos.push({ n: corrida.turnos.length + 1, origen: "improvisado", usuario: mensaje, ...resultado });
  corrida.caso = await cliente.getCaso(sesionId).catch(() => null);
  corrida.expectativas = evaluarExpectativas(escenario.expectativas, corrida.turnos, corrida.caso);
  guardarCorrida(corrida, base);
  process.stdout.write(`Turno improvisado agregado. Reporte: ${base}.md\n`);
}

async function listar(cliente: ClienteRevision, incluirBorradores: boolean): Promise<void> {
  await cliente.autenticar(NOMBRE_RUNNER);
  const sesiones = (await cliente.listarSesiones(incluirBorradores)).filter(
    (sesion) => sesion.origenRevision === "AUTONOMA",
  );
  if (sesiones.length === 0) {
    process.stdout.write("Sin corridas autónomas en el entorno objetivo.\n");
    return;
  }
  for (const sesion of sesiones) {
    const estado = sesion.borrador ? "[borrador]" : "[publicada]";
    process.stdout.write(`${sesion.id}  ${estado}  ${sesion.titulo ?? "(sin título)"}  ${sesion.actualizadaEn}\n`);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string" },
      clave: { type: "string" },
      publicar: { type: "boolean", default: false },
      mensaje: { type: "string" },
      borradores: { type: "boolean", default: false },
    },
  });
  const [comando, argumento] = positionals;
  const url = values.url ?? process.env.ESCENARIO_URL ?? URL_DEFAULT;
  const clave = values.clave ?? process.env.REVISION_CLAVE;
  if (clave === undefined || clave === "") throw new Error(`Falta la clave: --clave o REVISION_CLAVE.\n${USO}`);
  const cliente = new ClienteRevision(url, clave);

  switch (comando) {
    case "correr": {
      if (argumento === undefined) throw new Error(USO);
      await correr(cliente, url, argumento, values.publicar ?? false);
      return;
    }
    case "continuar": {
      if (argumento === undefined || values.mensaje === undefined) throw new Error(USO);
      await continuar(cliente, argumento, values.mensaje);
      return;
    }
    case "publicar": {
      if (argumento === undefined) throw new Error(USO);
      await cliente.autenticar(NOMBRE_RUNNER);
      await cliente.publicar(argumento);
      process.stdout.write("Corrida publicada al listado del equipo legal.\n");
      return;
    }
    case "listar": {
      await listar(cliente, values.borradores ?? false);
      return;
    }
    default:
      throw new Error(USO);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`escenario falló: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Registrar el comando y el gitignore**

En `frontend/package.json`, después de `"test": "playwright test …"`:

```json
    "escenario": "tsx scripts/escenario.ts",
```

En `frontend/.gitignore`, al final:

```
escenarios/corridas/
```

- [ ] **Step 5: Crear el escenario de ejemplo**

`frontend/escenarios/divorcio-con-hijos-visitas.json` (el del spec §2):

```json
{
  "titulo": "Divorcio con hijos y desacuerdo por visitas",
  "descripcion": "Valida clasificación a divorcio-sociedad-conyugal, respaldo del corpus al explicar las vías de divorcio, y captación con contacto.",
  "persona": "Mariana Techera (ficticia), 38 años, Montevideo. Casada hace 11 años, dos hijos (6 y 9). Se separó de hecho hace un mes; el padre ve a los chicos de forma irregular y discuten por las visitas. No hay violencia. Trabaja como administrativa, el esposo es taxista. No sabe si necesita el acuerdo de él para divorciarse. Busca entender cómo arrancar y qué pasa con los hijos. Teléfono ficticio: 099 000 001.",
  "turnos": [
    "me quiero divorciar pero tenemos dos hijos chicos y no se como es",
    "el se puede negar? porque no quiere saber nada con divorciarse",
    "y con los nenes como queda el tema de las visitas?",
    "dale, me interesa que me contacte un abogado. soy Mariana, mi telefono es 099 000 001"
  ],
  "expectativas": {
    "clasificacion": { "categoria": "familia", "subcategoria": "divorcio-sociedad-conyugal" },
    "llamoBuscarDocumentos": true,
    "casoCaptado": true,
    "contactoRegistrado": true
  }
}
```

- [ ] **Step 6: Verificar typecheck, lint y el mensaje de uso**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: sin errores.

Run: `cd frontend && pnpm escenario 2>&1; echo "exit=$?"`
Expected: imprime el bloque `Uso:` por stderr y `exit=1` (sin clave o sin comando — cualquiera de los dos errores es aceptable según el entorno).

- [ ] **Step 7: Commit**

```bash
git add frontend/scripts/escenario.ts frontend/scripts/escenario frontend/escenarios frontend/package.json frontend/.gitignore
git commit -m "feat(escenarios): runner CLI pnpm escenario con reporte introspectivo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Skill `reproducir-escenario` + CLAUDE.md

**Files:**
- Create: `.claude/skills/reproducir-escenario/SKILL.md`
- Modify: `CLAUDE.md` (sección "Reglas críticas" y "Comandos")

**Interfaces:**
- Consumes: comandos del runner (Task 5), formato de escenario (Task 4), publicación (Task 2).
- Produces: proceso operativo; nada de código.

- [ ] **Step 1: Escribir la skill**

`.claude/skills/reproducir-escenario/SKILL.md`:

```markdown
---
name: reproducir-escenario
description: Use cuando el equipo pida reproducir un caso o escenario, probar el sistema como usuario, o diagnosticar una conversación punta a punta — corre el runner pnpm escenario (vía /revision), improvisa en personaje si hace falta y analiza el reporte (tool-calls, latencias, caso).
---

# Reproducir escenario

Reproduce conversaciones de prueba contra el sistema por el mismo pipeline que un
consultante real (orchestrateChatTurn vía los endpoints de /revision), con
introspección completa: tool-calls con args, latencias por turno y snapshot del
Caso. Las corridas quedan como sesiones de revisión autónomas (borrador hasta
publicarlas). Spec: `docs/plans/2026-07-22-sistema-escenarios-reproducibles.md`.

**Anunciar al inicio:** "Reproduciendo el escenario con la skill reproducir-escenario."

## Checklist (crear un todo por fase)

### Fase 1 — Resolver el escenario
- Buscar el slug pedido en `frontend/escenarios/`. Si no existe, crear el archivo
  JSON siguiendo el formato del spec §2:
  - `persona` con hechos concretos uruguayos y datos de contacto FICTICIOS
    (la corrida crea un Caso real en la base, aunque excluido de métricas).
  - `turnos`: guion de 3-6 mensajes en voz de consultante real (coloquial,
    minúsculas, a veces sin tildes) — la fidelidad incluye cómo escribe la gente.
  - `expectativas`: solo las que el escenario viene a validar, no todas siempre.
- El escenario nuevo se versiona en git: es lo que vuelve reproducible el pedido.

### Fase 2 — Precondiciones
- Confirmar el entorno objetivo (default: prod). Si lo que se quiere probar es un
  cambio reciente, verificar ANTES que el deploy de Railway que lo incluye esté en
  SUCCESS — reproducir contra prod un cambio que aún no llegó es el falso
  negativo clásico.
- Verificar que `REVISION_CLAVE` (en `frontend/.env`) sea la clave del entorno
  objetivo; para otro entorno, pasar `--clave` / `--url`.

### Fase 3 — Correr e improvisar
- `cd frontend && pnpm escenario correr <slug>`.
- Si el agente pregunta algo que el guion no cubre, responder con
  `pnpm escenario continuar <sesionId> --mensaje "..."` EN PERSONAJE:
  - Solo hechos de la `persona`; nunca contradecirla.
  - Si falta un hecho, definirlo con criterio y AGREGARLO a la `persona` del
    archivo del escenario (la próxima corrida lo tiene; el turno igual queda
    marcado `improvisado` en el reporte).
  - Nunca romper la cuarta pared ni usar lenguaje técnico-legal que un
    consultante real no usaría — eso invalida la prueba.

### Fase 4 — Analizar el reporte
Sobre `escenarios/corridas/<slug>/<timestamp>.md` (y el `.json` como fuente):
- **Clasificación**: ¿correcta y oportuna (en el primer turno con señal
  suficiente)? ¿`corregir-clasificacion` usado como corresponde?
- **Respaldo**: ¿cada afirmación normativa tiene un `buscar-documentos` previo con
  filtros correctos (categoria/subcategorias)? ¿Afirmó algo que la tool no trajo?
- **Captación**: ¿`registrar-caso` proactivo (datos registrados apenas
  aparecieron)? ¿Contacto en el Caso, estado esperado, brief fiel a la
  conversación?
- **Voz**: ¿referencias internas ("documento", "corpus", títulos), referencias a
  la UI, frase institucional Jurco ante la pregunta por el origen?
- **Ineficiencias**: búsquedas redundantes (misma consulta repetida), turnos de
  más para captar, latencias anómalas.

### Fase 5 — Cierre
- Resumir los hallazgos con evidencia (turno + tool-call).
- Triage de cada problema con el mismo árbol que `revisar-feedback-legal`:
  rule · skill · RAG · eval · pregunta enviable al equipo legal
  (`docs/preguntas-legales/`) · bug de código. Las dudas de dominio legal NUNCA
  se resuelven por cuenta propia (regla SIEMPRE de `CLAUDE.md`).
- Publicar la corrida (`pnpm escenario publicar <sesionId>`) SOLO si aporta al
  equipo legal — el listado compartido muestra corridas curadas, no debugging.

## Red flags
- Leer una corrida contra prod como señal sin verificar que el cambio esté
  deployado.
- Improvisar hechos que contradicen la persona, o "ayudarle" al agente.
- Publicar corridas de debugging.
- Tratar las expectativas como gate (el gate es `pnpm evals`).
- Convertir un hallazgo de dominio legal en fix sin la pregunta al equipo legal.
```

- [ ] **Step 2: Actualizar CLAUDE.md**

En "Reglas críticas", después del bullet de `revisar-feedback-legal`, agregar:

```markdown
- **SIEMPRE** reproducir conversaciones de prueba punta a punta con la skill `reproducir-escenario` (runner `pnpm escenario`, vía los endpoints de `/revision`): escenarios versionados en `frontend/escenarios/`, corridas autónomas nacen como borrador y solo se publican al listado del equipo legal cuando aportan.
```

En "Comandos", la línea de Frontend pasa a terminar en:

```markdown
… `pnpm feedback:pull` · `pnpm feedback:respond` · `pnpm escenario correr <slug>`
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/reproducir-escenario CLAUDE.md
git commit -m "docs(skills): skill reproducir-escenario y registro del comando

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación integral

**Files:** ninguno nuevo (solo corre gates).

- [ ] **Step 1: Suite completa del frontend**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit -- --run`
Expected: todo verde (los tests previos del repo + los nuevos de Tasks 2-4).

- [ ] **Step 2: Backend intacto**

Run: `cd backend && pnpm test && pnpm lint`
Expected: verde — este feature no toca el backend; el paso confirma que nada se rompió por accidente.

- [ ] **Step 3: Push y PR**

```bash
git push -u origin feat/escenarios-reproducibles
gh pr create --title "feat: sistema de escenarios reproducibles (runner + skill)" --body "$(cat <<'EOF'
Implementa docs/plans/2026-07-22-sistema-escenarios-reproducibles.md:

- Migración: Conversation.origenRevision (EXPERTO|AUTONOMA) + borrador, con backfill.
- API /revision: POST sesiones con origen autónomo, GET con ?borradores=1, detalle con snapshot del Caso, PATCH para publicar.
- Badge "Generada por el asistente técnico" en el listado compartido.
- Runner pnpm escenario (correr/continuar/publicar/listar): HTTP puro vía /revision, SSE con tool-calls y latencias, reporte JSON+MD por corrida, expectativas informativas.
- Escenario de ejemplo (familia/divorcio) + skill reproducir-escenario + CLAUDE.md.

La migración la aplica el preDeploy de Railway (prisma migrate deploy).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Smoke post-deploy (manual, tras el merge)**

Con el deploy en SUCCESS: `cd frontend && pnpm escenario correr divorcio-con-hijos-visitas` y revisar el reporte con la skill `reproducir-escenario` (fase 4). No bloquea el PR — es la validación operativa del mecanismo completo.

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec**: §2 escenarios → Tasks 4+5 · §3 runner → Task 5 · §4 reporte → Tasks 4+5 · §5 schema/API → Tasks 1+2 · §6 UI → Task 3 · §7 skill → Task 6 · §8 testing → Tasks 2-4+7 · §10 docs → Task 6. La lib pura vive en `src/lib/escenarios/` (el spec decía `scripts/escenario/schema.ts`): el include de vitest es `src/**` — desviación deliberada para que sea testeable, registrada acá.
- **Placeholders**: ninguno — todo el código está completo en los steps.
- **Consistencia de tipos**: `RespuestaTurno` (cliente) se esparce en `TurnoCorrida` (schema) — campos idénticos + `n`/`origen`/`usuario`; `CasoSnapshot` (server) y `CasoCorrida` (runner) son el mismo shape a ambos lados del JSON del GET; `SesionListado` refleja `SesionResumen` serializado.
