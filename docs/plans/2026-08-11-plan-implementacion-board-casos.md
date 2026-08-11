# Board — tab Casos: plan de implementación

> **Para quien ejecute esto:** usá `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementarlo task por task. Los pasos usan checkbox (`- [ ]`) para seguimiento.

**Objetivo:** agregar al board el tab `Casos` — listado filtrable de todos los casos (nuevos e históricos) y estado de gestión del equipo humano sobre la ficha ya existente.

**Diseño:** `docs/plans/2026-08-11-board-casos.md`.

**Arquitectura:** una columna `gestion` en `Caso` con su enum, más un `CasoEvento` tipo `GESTION` por cada cambio (estado vigente consultable + historia append-only). Sobre eso, una capa server nueva (`lib/board/casos.ts` para el listado, `lib/casos/gestion.ts` para la escritura), dos rutas de API y dos piezas de UI: un listado nuevo y un bloque de gestión dentro de la ficha existente.

**Stack:** Next.js 16 (App Router, RSC + route handlers), Prisma sobre Postgres, Zod para todo contrato, SWR en el cliente, Vitest + Testing Library para unit, Playwright para E2E. Todo dentro de `frontend/`.

## Restricciones globales

- **NUNCA `any`** — `unknown` + Zod. Contratos como schema Zod, tipos con `z.infer`.
- **NUNCA `console.log`** — logger estructurado (`@/utils/logger`).
- **Nada de `esRevision` inline**: el alcance sale siempre de `casosReales` / `conversacionesReales` de `src/lib/board/scope.ts`.
- Naming: código en inglés camelCase; archivos e ids en kebab-case español; prosa user-facing en español rioplatense.
- Los comandos corren desde `frontend/`: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test` (e2e), `pnpm prisma:migrate`.
- `frontend/.env` apunta a la Postgres **local** (`localhost:5432/legalseller`) — es contra esa base que corre la migración. `backend/.env` apunta a producción: no correr migraciones con ese entorno.
- Conventional commits, en español. Un commit por task.
- Antes de empezar: `cd frontend && pnpm install` si no hay `node_modules`.

---

### Task 1: Migración — gestión en el modelo `Caso`

**Archivos:**
- Modificar: `frontend/prisma/schema.prisma` (modelo `Caso`, enum `CasoEventoTipo`)
- Crear: `frontend/prisma/migrations/<timestamp>_gestion_de_casos/migration.sql` (lo genera Prisma)

**Interfaces:**
- Consume: nada.
- Produce: enum `CasoGestion` (`NUEVO` | `CONTACTADO` | `DERIVADO` | `DESCARTADO`) y los campos `Caso.gestion`, `Caso.gestionNota`, `Caso.gestionPor`, `Caso.gestionEn`; valor `GESTION` en `CasoEventoTipo`. Todo importable desde `@prisma/client`.

- [ ] **Paso 1: agregar los campos al modelo `Caso`**

En `frontend/prisma/schema.prisma`, dentro de `model Caso`, después de `correccionAplicada`:

```prisma
  /// Estado de gestión del equipo humano. Eje independiente de `estado`, que
  /// lo escribe el agente: un caso CAPTADO puede estar DESCARTADO (llegó el
  /// contacto y el caso no calificó). Nunca se escriben entre sí.
  gestion            CasoGestion @default(NUEVO)
  /// Nota interna del último cambio de gestión — el "por qué" del cambio de
  /// estado. La información del caso va a `NotaCaso`, que es otra cosa.
  gestionNota        String?
  /// Nombre de quien hizo el último cambio, resuelto desde la sesión del
  /// board. Nunca viene del body.
  gestionPor         String?
  gestionEn          DateTime?
```

Y en los índices del mismo modelo, después de `@@index([estado, updatedAt(sort: Desc)])`:

```prisma
  @@index([gestion, updatedAt(sort: Desc)])
```

- [ ] **Paso 2: agregar el enum y el tipo de evento**

En el mismo archivo, junto a los otros enums:

```prisma
/// Estado de gestión del equipo humano sobre un lead. Sin guard de
/// transición: cualquier estado va a cualquier otro, y el trail de
/// `CasoEvento` deja la corrección a la vista.
enum CasoGestion {
  NUEVO
  CONTACTADO
  DERIVADO
  DESCARTADO
}
```

Y agregar `GESTION` al final del enum existente:

```prisma
enum CasoEventoTipo {
  CLASIFICACION
  CORRECCION
  REGISTRO_DATO
  CONTACTO
  GESTION
}
```

- [ ] **Paso 3: generar y aplicar la migración**

```bash
cd frontend
pnpm prisma:migrate --name gestion_de_casos
```

Esperado: crea `prisma/migrations/<timestamp>_gestion_de_casos/`, aplica sobre la base local y regenera el cliente. La migración es **aditiva** (columnas con default y valores de enum nuevos): no debe pedir reset ni reportar pérdida de datos. Si pide reset, parar y revisar — la base es compartida entre worktrees.

- [ ] **Paso 4: verificar que el cliente tipa los campos nuevos**

```bash
cd frontend && pnpm typecheck
```

Esperado: pasa. Si `@prisma/client` no expone `CasoGestion`, correr `pnpm prisma generate` y repetir.

- [ ] **Paso 5: commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(board): agrega el eje de gestión al modelo Caso"
```

---

### Task 2: `actualizarGestion` — la escritura

**Archivos:**
- Crear: `frontend/src/lib/casos/gestion.ts`
- Crear: `frontend/src/lib/casos/gestion.test.ts`

**Interfaces:**
- Consume: `casosReales` de `@/lib/board/scope`, `prisma` de `@/lib/prisma`, `CasoGestion` de `@prisma/client`.
- Produce:
  - `interface CambioGestion { id: string; de: string | null; a: string; nota: string | null; por: string; createdAt: string }`
  - `interface GestionCaso { estado: CasoGestion; nota: string | null; por: string | null; en: string | null; historial: CambioGestion[] }`
  - `async function actualizarGestion(params: { casoId: string; gestion: CasoGestion; nota?: string; por: string }): Promise<GestionCaso | null>`
  - `async function leerGestion(casoId: string): Promise<GestionCaso | null>`

- [ ] **Paso 1: escribir el test que falla**

Crear `frontend/src/lib/casos/gestion.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    caso: { updateMany: vi.fn(), findFirst: vi.fn() },
    casoEvento: { create: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { actualizarGestion, leerGestion } from "./gestion";

const CASO = {
  id: "caso-1",
  gestion: "CONTACTADO",
  gestionNota: "Le escribí por WhatsApp.",
  gestionPor: "ana@estudio.uy",
  gestionEn: new Date("2026-08-11T12:00:00.000Z"),
};

const EVENTO = {
  id: "ev-1",
  payload: { de: "NUEVO", a: "CONTACTADO", nota: "Le escribí por WhatsApp.", por: "ana@estudio.uy" },
  createdAt: new Date("2026-08-11T12:00:00.000Z"),
};

describe("actualizarGestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.prisma.caso.findFirst.mockResolvedValue({ id: "caso-1", gestion: "NUEVO" });
    prismaMock.prisma.caso.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.prisma.casoEvento.create.mockResolvedValue(EVENTO);
    prismaMock.prisma.casoEvento.findMany.mockResolvedValue([EVENTO]);
  });

  it("escribe el estado y deja el evento con el estado anterior", async () => {
    prismaMock.prisma.caso.findFirst
      .mockResolvedValueOnce({ id: "caso-1", gestion: "NUEVO" })
      .mockResolvedValueOnce(CASO);

    const gestion = await actualizarGestion({
      casoId: "caso-1",
      gestion: "CONTACTADO",
      nota: "Le escribí por WhatsApp.",
      por: "ana@estudio.uy",
    });

    expect(prismaMock.prisma.casoEvento.create).toHaveBeenCalledWith({
      data: {
        casoId: "caso-1",
        tipo: "GESTION",
        payload: { de: "NUEVO", a: "CONTACTADO", nota: "Le escribí por WhatsApp.", por: "ana@estudio.uy" },
      },
      select: { id: true, payload: true, createdAt: true },
    });
    expect(gestion).toEqual({
      estado: "CONTACTADO",
      nota: "Le escribí por WhatsApp.",
      por: "ana@estudio.uy",
      en: "2026-08-11T12:00:00.000Z",
      historial: [
        {
          id: "ev-1",
          de: "NUEVO",
          a: "CONTACTADO",
          nota: "Le escribí por WhatsApp.",
          por: "ana@estudio.uy",
          createdAt: "2026-08-11T12:00:00.000Z",
        },
      ],
    });
  });

  // El guard vive en la query, no en la UI: un caso de sesión de revisión no
  // se gestiona ni conociendo su id.
  it("un caso inexistente o de revisión devuelve null sin escribir evento", async () => {
    prismaMock.prisma.caso.findFirst.mockResolvedValue(null);

    expect(
      await actualizarGestion({ casoId: "caso-x", gestion: "DERIVADO", por: "ana@estudio.uy" }),
    ).toBeNull();
    expect(prismaMock.prisma.caso.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.prisma.casoEvento.create).not.toHaveBeenCalled();
  });

  // Carrera: el caso existía al leerlo y dejó de estar en alcance al escribir.
  it("si el update no afecta filas no deja evento huérfano", async () => {
    prismaMock.prisma.caso.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await actualizarGestion({ casoId: "caso-1", gestion: "DERIVADO", por: "ana@estudio.uy" }),
    ).toBeNull();
    expect(prismaMock.prisma.casoEvento.create).not.toHaveBeenCalled();
  });

  it("sin nota guarda null, no un string vacío", async () => {
    prismaMock.prisma.caso.findFirst
      .mockResolvedValueOnce({ id: "caso-1", gestion: "NUEVO" })
      .mockResolvedValueOnce({ ...CASO, gestion: "DERIVADO", gestionNota: null });

    await actualizarGestion({ casoId: "caso-1", gestion: "DERIVADO", nota: "  ", por: "ana@estudio.uy" });

    expect(prismaMock.prisma.caso.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gestionNota: null }) }),
    );
  });
});

describe("leerGestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.prisma.caso.findFirst.mockResolvedValue(CASO);
    prismaMock.prisma.casoEvento.findMany.mockResolvedValue([EVENTO]);
  });

  it("devuelve el estado vigente con su historial", async () => {
    const gestion = await leerGestion("caso-1");
    expect(gestion?.estado).toBe("CONTACTADO");
    expect(gestion?.historial).toHaveLength(1);
  });

  // Un payload con forma inesperada (evento escrito por una versión vieja) no
  // puede tumbar la ficha entera: se sirve con los campos que se entienden.
  it("tolera un payload de evento con forma inesperada", async () => {
    prismaMock.prisma.casoEvento.findMany.mockResolvedValue([
      { id: "ev-2", payload: "texto suelto", createdAt: new Date("2026-08-11T13:00:00.000Z") },
    ]);

    const gestion = await leerGestion("caso-1");
    expect(gestion?.historial).toEqual([
      { id: "ev-2", de: null, a: "", nota: null, por: "", createdAt: "2026-08-11T13:00:00.000Z" },
    ]);
  });

  it("un caso fuera de alcance devuelve null", async () => {
    prismaMock.prisma.caso.findFirst.mockResolvedValue(null);
    expect(await leerGestion("caso-x")).toBeNull();
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/casos/gestion.test.ts
```

Esperado: FAIL — `Failed to resolve import "./gestion"`.

- [ ] **Paso 3: implementar**

Crear `frontend/src/lib/casos/gestion.ts`:

```typescript
import "server-only";

import type { CasoGestion } from "@prisma/client";
import { z } from "zod";

import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";

export interface CambioGestion {
  id: string;
  /** Estado previo; null cuando el evento no lo registró. */
  de: string | null;
  a: string;
  nota: string | null;
  por: string;
  createdAt: string;
}

export interface GestionCaso {
  estado: CasoGestion;
  nota: string | null;
  por: string | null;
  en: string | null;
  /** Cambios del más reciente al más viejo. */
  historial: CambioGestion[];
}

/**
 * El payload de un `CasoEvento` es Json sin tipar. Se parsea con un schema
 * laxo en vez de confiar en la forma: un evento escrito por una versión vieja
 * del código no puede tumbar la ficha entera. Los campos que faltan caen a un
 * valor neutro y la fila se muestra igual.
 */
const payloadSchema = z
  .object({
    de: z.string().nullish(),
    a: z.string().nullish(),
    nota: z.string().nullish(),
    por: z.string().nullish(),
  })
  .catch({});

function aCambio(evento: { id: string; payload: unknown; createdAt: Date }): CambioGestion {
  const payload = payloadSchema.parse(evento.payload);
  return {
    id: evento.id,
    de: payload.de ?? null,
    a: payload.a ?? "",
    nota: payload.nota ?? null,
    por: payload.por ?? "",
    createdAt: evento.createdAt.toISOString(),
  };
}

async function armarGestion(casoId: string): Promise<GestionCaso | null> {
  const [caso, eventos] = await Promise.all([
    prisma.caso.findFirst({
      where: { id: casoId, ...casosReales(null) },
      select: { gestion: true, gestionNota: true, gestionPor: true, gestionEn: true },
    }),
    prisma.casoEvento.findMany({
      where: { casoId, tipo: "GESTION" },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true, createdAt: true },
    }),
  ]);
  if (!caso) return null;

  return {
    estado: caso.gestion,
    nota: caso.gestionNota,
    por: caso.gestionPor,
    en: caso.gestionEn?.toISOString() ?? null,
    historial: eventos.map(aCambio),
  };
}

/** La gestión vigente de un caso. `null` si no existe o es de una sesión de revisión. */
export async function leerGestion(casoId: string): Promise<GestionCaso | null> {
  return armarGestion(casoId);
}

/**
 * Cambia el estado de gestión y deja el rastro en `CasoEvento`.
 *
 * El `updateMany` va guardado por `casosReales(null)` —y no un `update` por
 * id— para que el alcance sea parte de la escritura: un caso de sesión de
 * revisión no se gestiona ni conociendo su id. Si afecta 0 filas no se
 * escribe evento: un trail con eventos de casos que nadie tocó es peor que
 * no tenerlo.
 */
export async function actualizarGestion(params: {
  casoId: string;
  gestion: CasoGestion;
  nota?: string;
  por: string;
}): Promise<GestionCaso | null> {
  const previo = await prisma.caso.findFirst({
    where: { id: params.casoId, ...casosReales(null) },
    select: { id: true, gestion: true },
  });
  if (!previo) return null;

  const nota = params.nota?.trim() ? params.nota.trim() : null;

  const { count } = await prisma.caso.updateMany({
    where: { id: params.casoId, ...casosReales(null) },
    data: {
      gestion: params.gestion,
      gestionNota: nota,
      gestionPor: params.por,
      gestionEn: new Date(),
    },
  });
  if (count === 0) return null;

  await prisma.casoEvento.create({
    data: {
      casoId: params.casoId,
      tipo: "GESTION",
      payload: { de: previo.gestion, a: params.gestion, nota, por: params.por },
    },
    select: { id: true, payload: true, createdAt: true },
  });

  return armarGestion(params.casoId);
}
```

- [ ] **Paso 4: correr el test y verificar que pasa**

```bash
cd frontend && pnpm vitest run src/lib/casos/gestion.test.ts
```

Esperado: PASS (8 tests).

- [ ] **Paso 5: commit**

```bash
git add src/lib/casos/gestion.ts src/lib/casos/gestion.test.ts
git commit -m "feat(board): escribe la gestión del caso con su rastro de eventos"
```

---

### Task 3: la ficha sirve la gestión

**Archivos:**
- Modificar: `frontend/src/lib/casos/caso-detalle.ts`
- Modificar: `frontend/src/lib/casos/caso-detalle.test.ts`

**Interfaces:**
- Consume: `leerGestion` y el tipo `GestionCaso` de `@/lib/casos/gestion` (Task 2).
- Produce: `DetalleCaso` gana el campo `gestion: GestionCaso`. Lo consumen `DetalleCaso.tsx` (Task 5) y la ruta `GET /api/board/casos/[id]`, que ya serializa lo que devuelve `obtenerCaso`.

- [ ] **Paso 1: escribir el test que falla**

En `frontend/src/lib/casos/caso-detalle.test.ts`, agregar dentro del `describe` existente de `obtenerCaso`. Leer primero el archivo para reusar sus mocks y su fila base — el mock de `@/lib/prisma` y el de `./sintesis` ya están armados ahí.

```typescript
  it("incluye la gestión vigente con su historial", async () => {
    gestionMock.leerGestion.mockResolvedValue({
      estado: "CONTACTADO",
      nota: "Le escribí por WhatsApp.",
      por: "ana@estudio.uy",
      en: "2026-08-11T12:00:00.000Z",
      historial: [
        {
          id: "ev-1",
          de: "NUEVO",
          a: "CONTACTADO",
          nota: "Le escribí por WhatsApp.",
          por: "ana@estudio.uy",
          createdAt: "2026-08-11T12:00:00.000Z",
        },
      ],
    });

    const caso = await obtenerCaso("caso-1");

    expect(caso?.gestion.estado).toBe("CONTACTADO");
    expect(caso?.gestion.historial).toHaveLength(1);
  });

  // La ficha tiene que renderizar aunque la gestión no se pueda leer: el
  // contacto y la síntesis son lo que el abogado necesita para trabajar.
  it("sin gestión legible sirve el caso con el estado por defecto", async () => {
    gestionMock.leerGestion.mockResolvedValue(null);

    const caso = await obtenerCaso("caso-1");

    expect(caso?.gestion).toEqual({ estado: "NUEVO", nota: null, por: null, en: null, historial: [] });
  });
```

Y arriba del archivo, junto a los otros mocks:

```typescript
const gestionMock = vi.hoisted(() => ({ leerGestion: vi.fn() }));
vi.mock("./gestion", () => gestionMock);
```

En el `beforeEach` del archivo, agregar el default:

```typescript
    gestionMock.leerGestion.mockResolvedValue({
      estado: "NUEVO",
      nota: null,
      por: null,
      en: null,
      historial: [],
    });
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/casos/caso-detalle.test.ts
```

Esperado: FAIL — `caso.gestion` es `undefined`.

- [ ] **Paso 3: implementar**

En `frontend/src/lib/casos/caso-detalle.ts`:

```typescript
import { leerGestion, type GestionCaso } from "./gestion";

const GESTION_VACIA: GestionCaso = { estado: "NUEVO", nota: null, por: null, en: null, historial: [] };
```

Agregar el campo a la interfaz `DetalleCaso`, después de `actualizadoEn`:

```typescript
  gestion: GestionCaso;
```

Dentro de `obtenerCaso`, después de resolver la síntesis:

```typescript
  // `leerGestion` vuelve a filtrar por `casosReales`, así que acá no puede
  // dar null (el caso ya pasó ese filtro); el fallback cubre la carrera de un
  // caso borrado entre las dos queries sin romper la ficha.
  const gestion = (await leerGestion(caso.id)) ?? GESTION_VACIA;
```

Y agregarlo al objeto devuelto, junto a `sintesis`:

```typescript
    gestion,
```

- [ ] **Paso 4: correr los tests y verificar que pasan**

```bash
cd frontend && pnpm vitest run src/lib/casos/caso-detalle.test.ts
```

Esperado: PASS, incluidos los tests que ya existían.

- [ ] **Paso 5: commit**

```bash
git add src/lib/casos/caso-detalle.ts src/lib/casos/caso-detalle.test.ts
git commit -m "feat(board): expone la gestión en el detalle del caso"
```

---

### Task 4: `PATCH /api/board/casos/[id]/gestion`

**Archivos:**
- Crear: `frontend/src/app/api/board/casos/[id]/gestion/route.ts`
- Crear: `frontend/src/app/api/board/casos/[id]/gestion/route.test.ts`
- Modificar: `frontend/src/lib/validations/board.ts`

**Interfaces:**
- Consume: `actualizarGestion` de `@/lib/casos/gestion` (Task 2), `parseRequestBody` de `@/lib/validations`, `auth` de `@/auth`.
- Produce: `actualizarGestionSchema` (exportado desde `@/lib/validations`) y el endpoint `PATCH /api/board/casos/:id/gestion` que responde `{ gestion: GestionCaso }`. Lo consume `DetalleCaso.tsx` (Task 5).

- [ ] **Paso 1: agregar el schema de validación**

En `frontend/src/lib/validations/board.ts`, al final:

```typescript
export const gestionSchema = z.enum(["NUEVO", "CONTACTADO", "DERIVADO", "DESCARTADO"]);

export const actualizarGestionSchema = z.object({
  gestion: gestionSchema,
  nota: z.string().max(2000).optional(),
});

export type ActualizarGestion = z.infer<typeof actualizarGestionSchema>;
```

- [ ] **Paso 2: escribir el test que falla**

Crear `frontend/src/app/api/board/casos/[id]/gestion/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const gestionMock = vi.hoisted(() => ({ actualizarGestion: vi.fn() }));
vi.mock("@/lib/casos/gestion", () => gestionMock);

import { PATCH } from "./route";

const GESTION = {
  estado: "CONTACTADO",
  nota: null,
  por: "ana@estudio.uy",
  en: "2026-08-11T12:00:00.000Z",
  historial: [],
};

function pedido(body: unknown): Request {
  return new Request("http://localhost/api/board/casos/caso-1/gestion", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const contexto = { params: Promise.resolve({ id: "caso-1" }) };

describe("PATCH /api/board/casos/[id]/gestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.auth.mockResolvedValue({ user: { email: "ana@estudio.uy" } });
    gestionMock.actualizarGestion.mockResolvedValue(GESTION);
  });

  it("guarda el cambio y devuelve la gestión vigente", async () => {
    const response = await PATCH(pedido({ gestion: "CONTACTADO" }), contexto);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gestion: GESTION });
    expect(gestionMock.actualizarGestion).toHaveBeenCalledWith({
      casoId: "caso-1",
      gestion: "CONTACTADO",
      nota: undefined,
      por: "ana@estudio.uy",
    });
  });

  // Defensa en profundidad: el proxy ya filtró, pero el handler no confía en él.
  it("sin sesión responde 401 sin tocar la base", async () => {
    authMock.auth.mockResolvedValue(null);
    const response = await PATCH(pedido({ gestion: "CONTACTADO" }), contexto);

    expect(response.status).toBe(401);
    expect(gestionMock.actualizarGestion).not.toHaveBeenCalled();
  });

  // El autor es identidad de sesión: aceptarlo del body dejaría firmar
  // cambios con el nombre de otra persona.
  it("ignora un autor mandado en el body", async () => {
    await PATCH(pedido({ gestion: "DERIVADO", por: "otro@estudio.uy" }), contexto);

    expect(gestionMock.actualizarGestion).toHaveBeenCalledWith(
      expect.objectContaining({ por: "ana@estudio.uy" }),
    );
  });

  it("una gestión fuera del enum responde 400", async () => {
    const response = await PATCH(pedido({ gestion: "ARCHIVADO" }), contexto);

    expect(response.status).toBe(400);
    expect(gestionMock.actualizarGestion).not.toHaveBeenCalled();
  });

  it("un caso inexistente o de revisión responde 404", async () => {
    gestionMock.actualizarGestion.mockResolvedValue(null);
    const response = await PATCH(pedido({ gestion: "DERIVADO" }), contexto);

    expect(response.status).toBe(404);
  });

  it("un error de la capa de datos responde 500 sin filtrar el detalle", async () => {
    gestionMock.actualizarGestion.mockRejectedValue(new Error("column gestion does not exist"));
    const response = await PATCH(pedido({ gestion: "DERIVADO" }), contexto);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("column gestion");
  });
});
```

- [ ] **Paso 3: correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run "src/app/api/board/casos/[id]/gestion/route.test.ts"
```

Esperado: FAIL — `Failed to resolve import "./route"`.

- [ ] **Paso 4: implementar**

Crear `frontend/src/app/api/board/casos/[id]/gestion/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { actualizarGestion } from "@/lib/casos/gestion";
import { actualizarGestionSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    const autor = sesion?.user?.name?.trim() || sesion?.user?.email?.trim();
    // Mismo criterio que la ruta hermana de notas: el autor es identidad de
    // sesión. No se usa getIdentidadBoard() a propósito — acepta además la
    // cookie del runner de escenarios, y el runner no gestiona leads.
    if (!autor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = await parseRequestBody(request, actualizarGestionSchema);
    if (!validation.success) return validation.response;

    const { id } = await params;
    const gestion = await actualizarGestion({
      casoId: id,
      gestion: validation.data.gestion,
      nota: validation.data.nota,
      por: autor,
    });
    if (!gestion) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json({ gestion });
  } catch (error) {
    logger.error("board/casos/[id]/gestion PATCH failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Paso 5: correr el test y verificar que pasa**

```bash
cd frontend && pnpm vitest run "src/app/api/board/casos/[id]/gestion/route.test.ts"
```

Esperado: PASS (6 tests).

- [ ] **Paso 6: commit**

```bash
git add src/app/api/board/casos src/lib/validations/board.ts
git commit -m "feat(board): agrega el endpoint de gestión del caso"
```

---

### Task 5: bloque de gestión en la ficha

**Archivos:**
- Modificar: `frontend/src/components/board/Casos/DetalleCaso.tsx`
- Modificar: `frontend/src/components/board/Casos/DetalleCaso.test.tsx`
- Modificar: `frontend/src/components/board/Casos/casos.module.css`

**Interfaces:**
- Consume: `DetalleCaso.gestion` (Task 3) y `PATCH /api/board/casos/:id/gestion` (Task 4).
- Produce: nada que otras tasks consuman.

- [ ] **Paso 1: escribir el test que falla**

En `frontend/src/components/board/Casos/DetalleCaso.test.tsx`, agregar `gestion` al `casoBase` existente:

```typescript
  gestion: { estado: "NUEVO", nota: null, por: null, en: null, historial: [] },
```

Y agregar los tests dentro del `describe` existente:

```typescript
  it("muestra el estado de gestión y permite cambiarlo", async () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: casoBase,
      error: undefined,
      isLoading: false,
      mutate,
    } as unknown as ReturnType<typeof useSWR>);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<DetalleCaso id="caso-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/casos/caso-1/gestion",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, opciones] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(opciones.body)).toEqual({ gestion: "CONTACTADO", nota: "" });
    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });

  // Un cambio que no se guardó y no avisa es peor que uno que falla ruidoso:
  // el equipo cree que el lead quedó marcado y nadie lo vuelve a mirar.
  it("avisa cuando el cambio de gestión falla", async () => {
    mockCaso(casoBase);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<DetalleCaso id="caso-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Derivado" }));

    expect(await screen.findByText("No pudimos guardar el cambio. Probá de nuevo.")).toBeInTheDocument();
  });

  it("lista los cambios anteriores con autor y fecha", () => {
    mockCaso({
      ...casoBase,
      gestion: {
        estado: "DERIVADO",
        nota: "Va a Martínez.",
        por: "ana@estudio.uy",
        en: "2026-08-11T12:00:00.000Z",
        historial: [
          {
            id: "ev-1",
            de: "CONTACTADO",
            a: "DERIVADO",
            nota: "Va a Martínez.",
            por: "ana@estudio.uy",
            createdAt: "2026-08-11T12:00:00.000Z",
          },
        ],
      },
    });

    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText(/Va a Martínez\./)).toBeInTheDocument();
    expect(screen.getByText(/ana@estudio\.uy/)).toBeInTheDocument();
  });
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/components/board/Casos/DetalleCaso.test.tsx
```

Esperado: FAIL — no existe el botón "Contactado".

- [ ] **Paso 3: implementar el bloque**

En `frontend/src/components/board/Casos/DetalleCaso.tsx`, agregar arriba del componente:

```typescript
const GESTIONES = [
  { valor: "NUEVO", etiqueta: "Nuevo" },
  { valor: "CONTACTADO", etiqueta: "Contactado" },
  { valor: "DERIVADO", etiqueta: "Derivado" },
  { valor: "DESCARTADO", etiqueta: "Descartado" },
] as const;
```

Dentro del componente, junto a los otros estados:

```typescript
  const [notaGestion, setNotaGestion] = useState("");
  const [cambiandoGestion, setCambiandoGestion] = useState(false);
  const [errorGestion, setErrorGestion] = useState(false);

  const cambiarGestion = async (gestion: string) => {
    setCambiandoGestion(true);
    try {
      const response = await fetch(`/api/board/casos/${id}/gestion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gestion, nota: notaGestion }),
      });
      if (response.ok) {
        setErrorGestion(false);
        setNotaGestion("");
        await mutate();
      } else {
        setErrorGestion(true);
      }
    } catch {
      setErrorGestion(true);
    } finally {
      setCambiandoGestion(false);
    }
  };
```

Y el bloque JSX, arriba de la sección de contacto:

```tsx
      <section className={styles.bloque} aria-labelledby="caso-gestion">
        <h2 className={styles.subtitulo} id="caso-gestion">Gestión</h2>
        <p className={styles.ayuda}>
          En qué anda este lead. Es independiente del estado que dejó la conversación.
        </p>
        <div className={styles.gestiones}>
          {GESTIONES.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              className={
                data.gestion.estado === opcion.valor
                  ? `${styles.botonGestion} ${styles.botonGestionActivo}`
                  : styles.botonGestion
              }
              aria-pressed={data.gestion.estado === opcion.valor}
              disabled={cambiandoGestion}
              onClick={() => void cambiarGestion(opcion.valor)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
        <label className={styles.etiqueta} htmlFor="nota-gestion">Nota del cambio (opcional)</label>
        <input
          id="nota-gestion"
          className={styles.input}
          value={notaGestion}
          onChange={(evento) => setNotaGestion(evento.target.value)}
          placeholder="Por qué cambiás el estado"
        />
        {errorGestion ? (
          <p role="status" className={styles.aviso}>No pudimos guardar el cambio. Probá de nuevo.</p>
        ) : null}
        {data.gestion.historial.length === 0 ? (
          <p className={styles.etiqueta}>Todavía nadie gestionó este caso.</p>
        ) : (
          <ul className={styles.notas}>
            {data.gestion.historial.map((cambio) => (
              <li key={cambio.id}>
                <p className={styles.etiqueta}>
                  {cambio.de ? `${cambio.de} → ${cambio.a}` : cambio.a} · {cambio.por} · {fecha(cambio.createdAt)}
                </p>
                {cambio.nota ? <p>{cambio.nota}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
```

Y cambiar el breadcrumb del header, que hoy apunta al único camino que existía:

```tsx
        <Link href="/board/casos" className={styles.link}>← Casos</Link>
```

- [ ] **Paso 4: agregar los estilos**

En `frontend/src/components/board/Casos/casos.module.css`, al final (leer el archivo primero para reusar sus variables de color):

```css
.gestiones {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.botonGestion {
  padding: 6px 14px;
  border: 1px solid var(--borde);
  border-radius: 999px;
  background: transparent;
  color: var(--texto);
  font-size: 13px;
  cursor: pointer;
}

.botonGestion:disabled {
  opacity: 0.6;
  cursor: default;
}

/* El estado activo se marca con borde y peso además del color: el color solo
   no distingue nada para quien no lo percibe. */
.botonGestionActivo {
  border-color: var(--acento);
  color: var(--acento);
  font-weight: 600;
}

.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--borde);
  border-radius: 6px;
  font: inherit;
  margin-bottom: 12px;
}
```

- [ ] **Paso 5: correr los tests y verificar que pasan**

```bash
cd frontend && pnpm vitest run src/components/board/Casos/DetalleCaso.test.tsx
```

Esperado: PASS, incluidos los tests que ya existían.

- [ ] **Paso 6: commit**

```bash
git add src/components/board/Casos
git commit -m "feat(board): agrega el bloque de gestión a la ficha del caso"
```

---

### Task 6: `listarCasos` — la capa del listado

**Archivos:**
- Crear: `frontend/src/lib/casos/situacion.ts`
- Crear: `frontend/src/lib/board/casos.ts`
- Crear: `frontend/src/lib/board/casos.test.ts`
- Modificar: `frontend/src/lib/board/captados.ts` (usa el helper extraído)
- Modificar: `frontend/src/lib/validations/board.ts`

**Interfaces:**
- Consume: `casosReales` de `@/lib/board/scope`, `fechaDesde` y `rangoSchema` de `@/lib/board/rango`, `gestionSchema` de `@/lib/validations/board` (Task 4).
- Produce:
  - `function situacionDe(contenido: unknown): string | null` en `@/lib/casos/situacion`
  - `interface CasoResumen { id: string; conversationId: string; fecha: string; ultimaActividad: string; gestion: string; estado: string; categoria: string | null; subcategorias: string[]; contactoNombre: string | null; contactoTelefono: string | null; contactoEmail: string | null; situacion: string | null }`
  - `interface PaginaCasos { casos: CasoResumen[]; cursor: string | null }`
  - `async function listarCasos(filtros: FiltrosCasos): Promise<PaginaCasos>`
  - `filtrosCasosSchema` / `type FiltrosCasos` en `@/lib/validations/board`

- [ ] **Paso 1: extraer el helper de situación**

Crear `frontend/src/lib/casos/situacion.ts` con el cuerpo que hoy vive privado en `lib/board/captados.ts`:

```typescript
/**
 * La `situacion` de una síntesis guardada. El Json de Postgres no está tipado
 * y acá no se valida el objeto entero a propósito: los listados solo muestran
 * este campo, y una síntesis vieja a la que le falte otro no tiene por qué
 * desaparecer de la tabla. La validación completa vive en `asegurarSintesis`.
 *
 * Sin `server-only`: es lectura pura de un Json, sin acceso a base ni a
 * secretos, y así puede testearse suelto.
 */
export function situacionDe(contenido: unknown): string | null {
  if (contenido === null || typeof contenido !== "object") return null;
  const situacion = (contenido as { situacion?: unknown }).situacion;
  return typeof situacion === "string" && situacion.trim() !== "" ? situacion : null;
}
```

En `frontend/src/lib/board/captados.ts`, borrar la función local `situacionDe` con su comentario y agregar el import:

```typescript
import { situacionDe } from "@/lib/casos/situacion";
```

- [ ] **Paso 2: verificar que el listado de captados sigue verde**

```bash
cd frontend && pnpm vitest run src/lib/board/captados.test.ts
```

Esperado: PASS sin cambios en el test — la extracción no cambia comportamiento.

- [ ] **Paso 3: agregar el schema de filtros**

En `frontend/src/lib/validations/board.ts`, después de `filtrosChatsSchema`:

```typescript
export const filtrosCasosSchema = z.object({
  rango: rangoSchema.default("30d"),
  // El default del listado es CAPTADO —el lead accionable— pero se pide
  // explícito desde el cliente: un default acá dejaría sin forma de pedir
  // "todos los estados", que es un filtro válido de la pantalla.
  estado: z.enum(["EN_CONVERSACION", "CAPTADO", "FUERA_DE_COBERTURA"]).optional(),
  gestion: gestionSchema.optional(),
  categoria: z.string().min(1).optional(),
  contacto: z.string().min(2).max(200).optional(),
  cursor: z.string().min(1).optional(),
});

export type FiltrosCasos = z.infer<typeof filtrosCasosSchema>;
```

(`gestionSchema` ya quedó definido en la Task 4; si esta task se ejecuta antes, definirlo acá.)

- [ ] **Paso 4: escribir el test que falla**

Crear `frontend/src/lib/board/casos.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: { caso: { findMany: vi.fn() }, $queryRaw: vi.fn() },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { listarCasos } from "./casos";

function filaCaso(overrides: Record<string, unknown> = {}) {
  return {
    id: "caso-1",
    conversationId: "conv-1",
    gestion: "NUEVO",
    estado: "CAPTADO",
    categoria: "laboral",
    subcategorias: ["despido"],
    contactoNombre: "Ana Pérez",
    contactoTelefono: "099111222",
    contactoEmail: "ana@example.com",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-08T10:00:00.000Z"),
    conversation: { threadId: "chat-1" },
    sintesis: { contenido: { situacion: "La despidieron sin causa." } },
    ...overrides,
  };
}

const FILTROS = { rango: "30d" } as const;

describe("listarCasos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.prisma.caso.findMany.mockResolvedValue([filaCaso()]);
    prismaMock.prisma.$queryRaw.mockResolvedValue([
      { threadId: "chat-1", ultimoMensaje: new Date("2026-08-09T14:00:00.000Z") },
    ]);
  });

  it("arma la fila con gestión, contacto y situación", async () => {
    const pagina = await listarCasos(FILTROS);

    expect(pagina.casos).toEqual([
      {
        id: "caso-1",
        conversationId: "conv-1",
        fecha: "2026-08-01T10:00:00.000Z",
        ultimaActividad: "2026-08-09T14:00:00.000Z",
        gestion: "NUEVO",
        estado: "CAPTADO",
        categoria: "laboral",
        subcategorias: ["despido"],
        contactoNombre: "Ana Pérez",
        contactoTelefono: "099111222",
        contactoEmail: "ana@example.com",
        situacion: "La despidieron sin causa.",
      },
    ]);
  });

  // El alcance no se escribe inline en ningún lado: sale de casosReales.
  it("excluye las sesiones de revisión", async () => {
    await listarCasos(FILTROS);

    const [{ where }] = prismaMock.prisma.caso.findMany.mock.calls[0] as [
      { where: { conversation?: { esRevision?: boolean } } },
    ];
    expect(where.conversation?.esRevision).toBe(false);
  });

  it("pasa los filtros de gestión, estado y categoría a la query", async () => {
    await listarCasos({ rango: "30d", gestion: "DERIVADO", estado: "CAPTADO", categoria: "familia" });

    const [{ where }] = prismaMock.prisma.caso.findMany.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(where).toMatchObject({ gestion: "DERIVADO", estado: "CAPTADO", categoria: "familia" });
  });

  it("busca el texto de contacto en los tres campos", async () => {
    await listarCasos({ rango: "30d", contacto: "ana" });

    const [{ where }] = prismaMock.prisma.caso.findMany.mock.calls[0] as [
      { where: { OR?: unknown[] } },
    ];
    expect(where.OR).toHaveLength(3);
  });

  // Sin síntesis guardada la celda queda vacía: generarla acá sería una
  // llamada al modelo por fila, y la bandeja dejaría de abrir.
  it("un caso sin síntesis sirve situacion null", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([filaCaso({ sintesis: null })]);

    const pagina = await listarCasos(FILTROS);
    expect(pagina.casos[0]?.situacion).toBeNull();
  });

  it("un thread sin mensajes cae a la fecha de actualización del caso", async () => {
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);

    const pagina = await listarCasos(FILTROS);
    expect(pagina.casos[0]?.ultimaActividad).toBe("2026-08-08T10:00:00.000Z");
  });

  it("sin filas no consulta los mensajes", async () => {
    prismaMock.prisma.caso.findMany.mockResolvedValue([]);

    expect(await listarCasos(FILTROS)).toEqual({ casos: [], cursor: null });
    expect(prismaMock.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("devuelve cursor solo cuando la página vino llena", async () => {
    const llena = Array.from({ length: 30 }, (_, indice) =>
      filaCaso({ id: `caso-${indice}`, conversation: { threadId: `chat-${indice}` } }),
    );
    prismaMock.prisma.caso.findMany.mockResolvedValue(llena);

    const pagina = await listarCasos(FILTROS);
    expect(pagina.cursor).toBe("caso-29");
  });
});
```

- [ ] **Paso 5: correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/board/casos.test.ts
```

Esperado: FAIL — `Failed to resolve import "./casos"`.

- [ ] **Paso 6: implementar**

Crear `frontend/src/lib/board/casos.ts`:

```typescript
import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { situacionDe } from "@/lib/casos/situacion";
import { prisma } from "@/lib/prisma";
import type { FiltrosCasos } from "@/lib/validations/board";

import { fechaDesde } from "./rango";
import { casosReales } from "./scope";

export interface CasoResumen {
  id: string;
  conversationId: string;
  fecha: string;
  /** MAX(createdAt) de mastra_messages; cae a `updatedAt` del caso si el
   * thread todavía no tiene mensajes persistidos. */
  ultimaActividad: string;
  gestion: string;
  estado: string;
  categoria: string | null;
  subcategorias: string[];
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  /** Primer párrafo de la síntesis ya guardada; null si el caso no tiene. */
  situacion: string | null;
}

export interface PaginaCasos {
  casos: CasoResumen[];
  cursor: string | null;
}

const POR_PAGINA = 30;

const filaUltimoSchema = z.object({
  threadId: z.string(),
  ultimoMensaje: z.coerce.date(),
});

/**
 * La bandeja de casos del board. `situacion` sale de la síntesis YA guardada:
 * generarla acá sería una llamada al modelo por fila (`asegurarSintesis`), y
 * treinta por página convierten la bandeja en un cuello de botella. El caso
 * sin síntesis la genera al abrir su ficha, que es donde el costo se paga una
 * vez y alguien lo está mirando.
 */
export async function listarCasos(filtros: FiltrosCasos): Promise<PaginaCasos> {
  const desde = fechaDesde(filtros.rango);

  const where: Prisma.CasoWhereInput = {
    ...casosReales(desde),
    ...(filtros.gestion ? { gestion: filtros.gestion } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
    ...(filtros.contacto
      ? {
          OR: [
            { contactoNombre: { contains: filtros.contacto, mode: "insensitive" } },
            { contactoTelefono: { contains: filtros.contacto, mode: "insensitive" } },
            { contactoEmail: { contains: filtros.contacto, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const filas = await prisma.caso.findMany({
    where,
    select: {
      id: true,
      conversationId: true,
      gestion: true,
      estado: true,
      categoria: true,
      subcategorias: true,
      contactoNombre: true,
      contactoTelefono: true,
      contactoEmail: true,
      createdAt: true,
      updatedAt: true,
      conversation: { select: { threadId: true } },
      sintesis: { select: { contenido: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: POR_PAGINA,
    ...(filtros.cursor ? { skip: 1, cursor: { id: filtros.cursor } } : {}),
  });
  if (filas.length === 0) return { casos: [], cursor: null };

  const threadIds = filas.map((fila) => fila.conversation.threadId);
  const ultimos = filaUltimoSchema.array().parse(
    await prisma.$queryRaw`
      SELECT m.thread_id AS "threadId", MAX(m."createdAt") AS "ultimoMensaje"
      FROM mastra.mastra_messages m
      WHERE m.thread_id IN (${Prisma.join(threadIds)})
      GROUP BY m.thread_id`,
  );
  const porThread = new Map(ultimos.map((fila) => [fila.threadId, fila.ultimoMensaje]));

  const casos = filas.map((fila) => ({
    id: fila.id,
    conversationId: fila.conversationId,
    fecha: fila.createdAt.toISOString(),
    ultimaActividad: (porThread.get(fila.conversation.threadId) ?? fila.updatedAt).toISOString(),
    gestion: fila.gestion,
    estado: fila.estado,
    categoria: fila.categoria,
    subcategorias: fila.subcategorias,
    contactoNombre: fila.contactoNombre,
    contactoTelefono: fila.contactoTelefono,
    contactoEmail: fila.contactoEmail,
    situacion: situacionDe(fila.sintesis?.contenido),
  }));

  return {
    casos,
    cursor: filas.length === POR_PAGINA ? (filas[filas.length - 1]?.id ?? null) : null,
  };
}
```

- [ ] **Paso 7: correr los tests y verificar que pasan**

```bash
cd frontend && pnpm vitest run src/lib/board/casos.test.ts src/lib/board/captados.test.ts
```

Esperado: PASS los dos archivos.

- [ ] **Paso 8: commit**

```bash
git add src/lib/board/casos.ts src/lib/board/casos.test.ts src/lib/casos/situacion.ts src/lib/board/captados.ts src/lib/validations/board.ts
git commit -m "feat(board): lista los casos con filtros y paginación"
```

---

### Task 7: `GET /api/board/casos`

**Archivos:**
- Crear: `frontend/src/app/api/board/casos/route.ts`
- Crear: `frontend/src/app/api/board/casos/route.test.ts`

**Interfaces:**
- Consume: `listarCasos` y `PaginaCasos` de `@/lib/board/casos` (Task 6), `filtrosCasosSchema` y `parseSearchParams` de `@/lib/validations`.
- Produce: `GET /api/board/casos` → `PaginaCasos`. Lo consume `ListadoCasos.tsx` (Task 8).

- [ ] **Paso 1: escribir el test que falla**

Crear `frontend/src/app/api/board/casos/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const casosMock = vi.hoisted(() => ({ listarCasos: vi.fn() }));
vi.mock("@/lib/board/casos", () => casosMock);

import { GET } from "./route";

function pedido(query: string): Request {
  return new Request(`http://localhost/api/board/casos${query}`);
}

describe("GET /api/board/casos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authMock.auth.mockResolvedValue({ user: { email: "ana@estudio.uy" } });
    casosMock.listarCasos.mockResolvedValue({ casos: [], cursor: null });
  });

  it("sin sesión responde 401 sin consultar la base", async () => {
    authMock.auth.mockResolvedValue(null);
    const response = await GET(pedido("?rango=7d"));

    expect(response.status).toBe(401);
    expect(casosMock.listarCasos).not.toHaveBeenCalled();
  });

  it("pasa los filtros recibidos", async () => {
    await GET(pedido("?rango=90d&gestion=DERIVADO&estado=CAPTADO&categoria=laboral&contacto=ana"));

    expect(casosMock.listarCasos).toHaveBeenCalledWith({
      rango: "90d",
      gestion: "DERIVADO",
      estado: "CAPTADO",
      categoria: "laboral",
      contacto: "ana",
    });
  });

  it("sin rango usa 30d por defecto", async () => {
    await GET(pedido(""));

    expect(casosMock.listarCasos).toHaveBeenCalledWith({ rango: "30d" });
  });

  it("una gestión fuera del enum responde 400", async () => {
    const response = await GET(pedido("?gestion=ARCHIVADO"));

    expect(response.status).toBe(400);
    expect(casosMock.listarCasos).not.toHaveBeenCalled();
  });

  it("un error de la capa de datos responde 500 sin filtrar el detalle", async () => {
    casosMock.listarCasos.mockRejectedValue(new Error("column gestion does not exist"));
    const response = await GET(pedido("?rango=7d"));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("column gestion");
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/app/api/board/casos/route.test.ts
```

Esperado: FAIL — `Failed to resolve import "./route"`.

- [ ] **Paso 3: implementar**

Crear `frontend/src/app/api/board/casos/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listarCasos } from "@/lib/board/casos";
import { filtrosCasosSchema, parseSearchParams } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function GET(request: Request) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = parseSearchParams(new URL(request.url).searchParams, filtrosCasosSchema);
    if (!validation.success) return validation.response;

    return NextResponse.json(await listarCasos(validation.data));
  } catch (error) {
    logger.error("board/casos GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Paso 4: correr el test y verificar que pasa**

```bash
cd frontend && pnpm vitest run src/app/api/board/casos/route.test.ts
```

Esperado: PASS (5 tests).

- [ ] **Paso 5: commit**

```bash
git add src/app/api/board/casos/route.ts src/app/api/board/casos/route.test.ts
git commit -m "feat(board): sirve el listado de casos por API"
```

---

### Task 8: el tab y su listado

**Archivos:**
- Crear: `frontend/src/components/board/Casos/ListadoCasos.tsx`
- Crear: `frontend/src/components/board/Casos/ListadoCasos.test.tsx`
- Crear: `frontend/src/app/board/casos/page.tsx`
- Modificar: `frontend/src/components/board/BoardShell/Sidebar.tsx`
- Modificar: `frontend/src/components/board/Metricas/MetricasPanel.tsx`
- Modificar: `frontend/src/components/board/Casos/casos.module.css`

**Interfaces:**
- Consume: `CasoResumen` y `PaginaCasos` de `@/lib/board/casos` (Task 6), `GET /api/board/casos` (Task 7).
- Produce: la ruta `/board/casos`. La consume el breadcrumb de la ficha (Task 5) y el E2E (Task 9).

- [ ] **Paso 1: escribir el test que falla**

Crear `frontend/src/components/board/Casos/ListadoCasos.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import useSWR from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CasoResumen, PaginaCasos } from "@/lib/board/casos";

import { ListadoCasos } from "./ListadoCasos";

// Mismo patrón que ListadoChats.test.tsx: se mockea el default export de swr
// y cada test controla { data, error, isLoading }.
vi.mock("swr", () => ({ default: vi.fn() }));

const casoBase: CasoResumen = {
  id: "caso-1",
  conversationId: "conv-1",
  fecha: "2026-08-01T10:00:00.000Z",
  ultimaActividad: "2026-08-09T14:00:00.000Z",
  gestion: "NUEVO",
  estado: "CAPTADO",
  categoria: "laboral",
  subcategorias: ["despido"],
  contactoNombre: "Ana Pérez",
  contactoTelefono: "099111222",
  contactoEmail: "ana@example.com",
  situacion: "La despidieron sin causa.",
};

function mockPagina(casos: CasoResumen[], cursor: string | null = null): void {
  const pagina: PaginaCasos = { casos, cursor };
  vi.mocked(useSWR).mockReturnValue({
    data: pagina,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useSWR>);
}

describe("ListadoCasos", () => {
  beforeEach(() => vi.resetAllMocks());

  it("muestra el caso con su gestión, contacto y situación", () => {
    mockPagina([casoBase]);
    render(<ListadoCasos />);

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("nuevo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /La despidieron sin causa/ })).toHaveAttribute(
      "href",
      "/board/casos/caso-1",
    );
  });

  // Abre por los leads accionables: el resto se pide con el filtro.
  it("arranca filtrado en captados", () => {
    mockPagina([casoBase]);
    render(<ListadoCasos />);

    expect(vi.mocked(useSWR).mock.calls[0]?.[0]).toContain("estado=CAPTADO");
  });

  it("un caso sin contacto ni síntesis se muestra igual", () => {
    mockPagina([
      {
        ...casoBase,
        estado: "EN_CONVERSACION",
        contactoNombre: null,
        contactoTelefono: null,
        contactoEmail: null,
        situacion: null,
      },
    ]);
    render(<ListadoCasos />);

    expect(screen.getByRole("link", { name: "Ver el caso" })).toBeInTheDocument();
  });

  it("sin casos avisa en vez de mostrar una tabla vacía", () => {
    mockPagina([]);
    render(<ListadoCasos />);

    expect(screen.getByText("No hay casos con estos filtros.")).toBeInTheDocument();
  });

  it("ofrece cargar más cuando hay cursor", () => {
    mockPagina([casoBase], "caso-1");
    render(<ListadoCasos />);

    expect(screen.getByRole("button", { name: "Cargar más" })).toBeInTheDocument();
  });

  it("un error de carga se avisa", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("falló"),
      isLoading: false,
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useSWR>);
    render(<ListadoCasos />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los casos.");
  });
});
```

- [ ] **Paso 2: correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/components/board/Casos/ListadoCasos.test.tsx
```

Esperado: FAIL — `Failed to resolve import "./ListadoCasos"`.

- [ ] **Paso 3: implementar el listado**

Crear `frontend/src/components/board/Casos/ListadoCasos.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { CasoResumen, PaginaCasos } from "@/lib/board/casos";
import type { Rango } from "@/lib/board/rango";

import styles from "./casos.module.css";

const GESTIONES = ["NUEVO", "CONTACTADO", "DERIVADO", "DESCARTADO"] as const;
const ESTADOS = ["EN_CONVERSACION", "CAPTADO", "FUERA_DE_COBERTURA"] as const;

/** El board se lee desde Uruguay; slice(0,10) sobre el ISO mostraría el día UTC. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", { timeZone: "America/Montevideo" });
}

function legible(valor: string): string {
  return valor.replace(/_/g, " ").toLowerCase();
}

async function traer(url: string): Promise<PaginaCasos> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar los casos");
  return (await response.json()) as PaginaCasos;
}

interface Filtros {
  rango: Rango;
  gestion: string;
  estado: string;
  categoria: string;
  contacto: string;
}

function construirParametros({ rango, gestion, estado, categoria, contacto }: Filtros): URLSearchParams {
  const params = new URLSearchParams({ rango });
  if (gestion) params.set("gestion", gestion);
  if (estado) params.set("estado", estado);
  if (categoria) params.set("categoria", categoria);
  if (contacto.length >= 2) params.set("contacto", contacto);
  return params;
}

/**
 * Una página más allá de la que maneja SWR, atada a la firma de filtros que la
 * produjo: una respuesta que resuelve después de que el usuario ya cambió de
 * filtro queda afuera sola, sin cancelarla ni compararla contra una ref.
 * Mismo mecanismo que `ListadoChats`.
 */
interface PaginaExtra {
  firma: string;
  casos: CasoResumen[];
  cursor: string | null;
}

export function ListadoCasos() {
  const [rango, setRango] = useState<Rango>("30d");
  const [gestion, setGestion] = useState<string>("");
  // Abre por los leads accionables; el resto está a un select de distancia.
  const [estado, setEstado] = useState<string>("CAPTADO");
  const [categoria, setCategoria] = useState<string>("");
  const [contacto, setContacto] = useState("");
  const [consulta, setConsulta] = useState("");

  const params = construirParametros({ rango, gestion, estado, categoria, contacto: consulta });
  const firmaFiltros = params.toString();

  const { data, error, isLoading } = useSWR(`/api/board/casos?${firmaFiltros}`, traer, {
    dedupingInterval: 15_000,
  });

  const [paginasExtra, setPaginasExtra] = useState<PaginaExtra[]>([]);
  const [cargandoMas, setCargandoMas] = useState(false);

  const paginasVigentes = paginasExtra.filter((pagina) => pagina.firma === firmaFiltros);
  const casos = [...(data?.casos ?? []), ...paginasVigentes.flatMap((pagina) => pagina.casos)];
  const ultimaVigente = paginasVigentes[paginasVigentes.length - 1];
  const cursor = ultimaVigente ? ultimaVigente.cursor : (data?.cursor ?? null);

  // Mismo criterio que ListadoChats: el select se deriva de lo cargado en este
  // render, porque el catálogo de categorías es server-only y el browser nunca
  // le habla directo al backend.
  const categoriasVistas = [
    ...new Set(casos.map((caso) => caso.categoria).filter((valor): valor is string => Boolean(valor))),
  ].sort();

  async function cargarMas() {
    if (!cursor || cargandoMas) return;
    const firmaAlPedir = firmaFiltros;
    setCargandoMas(true);
    try {
      const siguientes = new URLSearchParams(params);
      siguientes.set("cursor", cursor);
      const pagina = await traer(`/api/board/casos?${siguientes.toString()}`);
      setPaginasExtra((previas) => [
        ...previas,
        { firma: firmaAlPedir, casos: pagina.casos, cursor: pagina.cursor },
      ]);
    } finally {
      setCargandoMas(false);
    }
  }

  return (
    <section>
      <header className={styles.encabezado}>
        <h1 className={styles.titulo}>Casos</h1>
        <form
          className={styles.filtros}
          onSubmit={(evento) => {
            evento.preventDefault();
            setConsulta(contacto.trim());
          }}
        >
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Rango</span>
            <select value={rango} onChange={(e) => setRango(e.target.value as Rango)}>
              <option value="7d">7 días</option>
              <option value="30d">30 días</option>
              <option value="90d">90 días</option>
              <option value="todo">Todo</option>
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Gestión</span>
            <select value={gestion} onChange={(e) => setGestion(e.target.value)}>
              <option value="">Todas</option>
              {GESTIONES.map((valor) => (
                <option key={valor} value={valor}>
                  {legible(valor)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {ESTADOS.map((valor) => (
                <option key={valor} value={valor}>
                  {legible(valor)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Categoría</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="">Todas</option>
              {categoriasVistas.map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.campo}>
            <span className={styles.etiqueta}>Contacto</span>
            <input
              type="search"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="Nombre, teléfono o mail"
            />
          </label>
          <button type="submit" className={styles.boton}>
            Buscar
          </button>
        </form>
      </header>

      {error ? <p role="alert" className={styles.error}>No pudimos cargar los casos.</p> : null}
      {isLoading || !data ? (
        <p className={styles.cargando}>Cargando…</p>
      ) : casos.length === 0 ? (
        <p className={styles.cargando}>No hay casos con estos filtros.</p>
      ) : (
        <>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th scope="col">Última actividad</th>
                <th scope="col">Gestión</th>
                <th scope="col">Estado</th>
                <th scope="col">Categoría</th>
                <th scope="col">Contacto</th>
                <th scope="col">Situación</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((caso) => (
                <tr key={caso.id}>
                  <td>{fechaCorta(caso.ultimaActividad)}</td>
                  <td>
                    <span className={styles.badge}>{legible(caso.gestion)}</span>
                  </td>
                  <td>{legible(caso.estado)}</td>
                  <td>{caso.categoria ?? "—"}</td>
                  <td>
                    {caso.contactoNombre ?? "—"}
                    {caso.contactoTelefono ? (
                      <span className={styles.etiqueta}> · {caso.contactoTelefono}</span>
                    ) : null}
                  </td>
                  <td>
                    <Link href={`/board/casos/${caso.id}`} className={styles.link}>
                      {caso.situacion ?? "Ver el caso"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.paginacion}>
            <p className={styles.contador}>
              {cursor ? `${casos.length} casos cargados — hay más.` : `${casos.length} casos en total.`}
            </p>
            {cursor ? (
              <button
                type="button"
                className={styles.boton}
                onClick={() => void cargarMas()}
                disabled={cargandoMas}
              >
                {cargandoMas ? "Cargando…" : "Cargar más"}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Paso 4: agregar los estilos que falten**

`casos.module.css` ya trae `encabezado`, `titulo`, `subtitulo`, `etiqueta`, `link`, `boton`, `error`, `cargando`, `ayuda`. Le faltan cinco clases que sí están en `frontend/src/components/board/Chats/chats.module.css`: `filtros`, `campo`, `tabla`, `paginacion` y `contador`. Copiarlas desde ahí con sus mismos valores (las dos pantallas son la misma tabla del board y deben verse igual), y agregar el badge:

```css
.badge {
  display: inline-block;
  padding: 2px 10px;
  border: 1px solid var(--borde);
  border-radius: 999px;
  font-size: 12px;
}
```

- [ ] **Paso 5: crear la página**

Crear `frontend/src/app/board/casos/page.tsx`:

```tsx
import { ListadoCasos } from "@/components/board/Casos/ListadoCasos";

export default function CasosPage() {
  return <ListadoCasos />;
}
```

- [ ] **Paso 6: agregar el tab al sidebar**

En `frontend/src/components/board/BoardShell/Sidebar.tsx`, en `SECCIONES`, después de Métricas:

```typescript
  { href: "/board/casos", etiqueta: "Casos" },
```

- [ ] **Paso 7: enlazar desde Métricas**

En `frontend/src/components/board/Metricas/MetricasPanel.tsx`, en la sección "Casos captados", debajo del `<p className={styles.ayuda}>` que la describe:

```tsx
            <p className={styles.ayuda}>
              <Link href="/board/casos" className={styles.link}>Ver todos los casos</Link>
            </p>
```

`Link` ya está importado en ese archivo y `.link` ya existe en `metricas.module.css` — no hace falta agregar ninguno de los dos.

- [ ] **Paso 8: correr los tests y verificar que pasan**

```bash
cd frontend && pnpm vitest run src/components/board
```

Esperado: PASS, incluidos `ListadoChats`, `DetalleChat`, `DetalleCaso` y `MetricasPanel`.

- [ ] **Paso 9: verificar tipos y lint**

```bash
cd frontend && pnpm typecheck && pnpm lint
```

Esperado: los dos pasan.

- [ ] **Paso 10: commit**

```bash
git add src/components/board src/app/board/casos/page.tsx
git commit -m "feat(board): agrega el tab Casos con su bandeja"
```

---

### Task 9: E2E y verificación final

**Archivos:**
- Modificar: `frontend/tests/board.spec.ts`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: nada.

- [ ] **Paso 1: escribir el test E2E**

En `frontend/tests/board.spec.ts`, agregar al final:

```typescript
test("la bandeja de casos abre la ficha y guarda la gestión", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board/casos");
  await expect(page.getByRole("heading", { name: "Casos" })).toBeVisible();

  // La tabla la llena SWR después del fetch: contar antes de que resuelva da
  // siempre 0 y hace que el test se saltee solo con un motivo falso.
  const filas = page.locator("tbody tr");
  const vacio = page.getByText("No hay casos con estos filtros.");
  await expect(filas.first().or(vacio)).toBeVisible({ timeout: 30_000 });

  if (await vacio.isVisible()) {
    test.skip(true, "Sin casos captados en la base de prueba");
  }

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/casos\/.+/);

  // La ficha genera la síntesis con IA al abrirse cuando no la tiene: el
  // bloque de gestión se renderiza igual, no espera por eso.
  await expect(page.getByRole("heading", { name: "Gestión" })).toBeVisible({ timeout: 30_000 });

  const contactado = page.getByRole("button", { name: "Contactado" });
  await contactado.click();
  await expect(contactado).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });

  // El cambio tiene que sobrevivir a la recarga: si solo vive en el estado
  // del cliente, el PATCH no llegó a la base y nadie se entera.
  await page.reload();
  await expect(page.getByRole("button", { name: "Contactado" })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 30_000 },
  );
});
```

- [ ] **Paso 2: correr la suite unitaria completa**

```bash
cd frontend && pnpm test:unit
```

Esperado: PASS. Baseline antes de este trabajo: 62 archivos / 443 tests — el total tiene que haber subido, no bajado.

- [ ] **Paso 3: correr typecheck y lint**

```bash
cd frontend && pnpm typecheck && pnpm lint
```

Esperado: los dos pasan sin warnings nuevos.

- [ ] **Paso 4: correr el E2E**

Necesita el backend Mastra corriendo en `MASTRA_BASE_URL` y **la misma base** que el frontend (`localhost:5432/legalseller`) — con bases distintas el transcript vuelve vacío y los tests agotan el timeout sin un error que lo explique.

```bash
# terminal 1
cd backend && pnpm dev
# terminal 2
cd frontend && pnpm test tests/board.spec.ts
```

Esperado: PASS, o skip explícito si la base local no tiene casos reales. Un skip por base vacía es aceptable; un timeout no.

- [ ] **Paso 5: commit**

```bash
git add tests/board.spec.ts
git commit -m "test(board): cubre la bandeja de casos punta a punta"
```

---

## Verificación de cobertura contra el spec

| Sección del spec | Task |
|---|---|
| §3 modelo de datos (columnas, enums, índice) | 1 |
| §4.2 `actualizarGestion` con guard y trail | 2 |
| §4.2 la ficha suma gestión e historial | 3 |
| §4.3 `PATCH .../gestion` con autor de sesión | 4 |
| §4.4 bloque de gestión + breadcrumb "← Casos" | 5 |
| §4.1 `listarCasos`, `situacionDe` compartido, sin generar síntesis | 6 |
| §4.3 `GET /api/board/casos` | 7 |
| §4.4 sidebar, listado, link desde Métricas | 8 |
| §6 testing y gates | 2-9 |
