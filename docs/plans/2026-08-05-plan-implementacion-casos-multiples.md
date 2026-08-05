# Casos múltiples por conversación — plan de implementación

> **Para quien lo ejecute:** usá `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementarlo tarea por tarea. Los pasos usan checkbox (`- [ ]`) para el seguimiento.

**Diseño**: `docs/plans/2026-08-05-casos-multiples-por-conversacion.md` (leerlo antes de empezar).

**Goal:** que una conversación pueda producir N casos —uno por categoría— de modo que quien trae un divorcio y un choque de tránsito genere dos leads derivables a abogados distintos, en vez de un único caso con la categoría del primero y el segundo tema degradado a una nota.

**Architecture:** `Caso.conversationId` deja de ser `@unique` y pasa a `@@unique([conversationId, categoria])`, que convierte la regla "un caso por categoría" en un invariante de base. `Conversation` gana `casoActivoId`, un escalar suelto que apunta al caso que atiende el turno; el ruteo pasa a leerse de ahí en vez de `Conversation.categoria`. El agente de categoría gana una signal tool `derivar-tema` que solo **marca**: cuando el BFF la observa en el stream SSE, corre el receptor sobre el mismo mensaje y este **decide** si abre, reactiva o ignora. El guard `correccionAplicada` se muda a `Caso`.

**Tech Stack:** Next.js 16 (App Router, BFF con route handlers), TypeScript estricto, Zod 4, Prisma + Postgres, Mastra (`@mastra/core`, `@mastra/memory`), Vitest + Testing Library, Playwright.

## Global Constraints

- **NUNCA** `any` — `unknown` + Zod. Contratos como schema Zod, tipos con `z.infer` o interfaces explícitas.
- **NUNCA** `console.log` — logger estructurado (`@/utils/logger`).
- **NUNCA** una tool de agente tira en `execute` — degradación graceful `{ status, mensaje }`.
- **NUNCA** el browser habla directo con el backend Mastra o la DB — todo pasa por el BFF.
- **SIEMPRE** imports por subpath de Mastra (`@mastra/core/tools`), nunca el barrel. En backend los imports relativos llevan extensión `.js` (ES Modules).
- Contenido inyectado al LLM: español rioplatense (vos en indicativo; subjuntivo en negación tuteante: "no adelantes"), sin emojis, sin la palabra "skill", sin citas normativas embebidas.
- Naming: código inglés camelCase; IDs Mastra y archivos kebab-case español.
- Conventional commits. Antes de cada commit: `pnpm lint` y los tests del paquete tocado.
- `backend/eslint.config.ts` exige `import-x/order` con `alphabetize: { order: "asc", caseInsensitive: true }` — un import fuera de orden rompe `pnpm lint`.
- `vi.resetAllMocks()` (no `clearAllMocks`) en `beforeEach` de tests que encolan `mockResolvedValueOnce`.
- Agregados numéricos en SQL crudo van casteados a `::float8`: `SUM()`/`COUNT()` sobre enteros vuelven como `BigInt` y rompen `JSON.stringify`.
- `pnpm test:unit` corre en modo **watch**; para one-shot es `pnpm test:unit run` o `pnpm exec vitest run <archivo>`.
- Después de tocar `schema.prisma`: `pnpm prisma:generate` **antes** de correr typecheck o tests, o los tipos mienten.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `frontend/prisma/schema.prisma` (modificar) | `Caso` 1:N, `@@unique([conversationId, categoria])`, `Conversation.casoActivoId`, `correccionAplicada` mudado a `Caso`. |
| `frontend/prisma/migrations/<ts>_casos_multiples_por_conversacion/migration.sql` (crear) | DDL + backfill de `casoActivoId`. |
| `frontend/src/lib/clasificacion.ts` (modificar) | Toda la capa de persistencia del caso. Gana `CasoActivo`, `resolverCasoActivo`, `abrirOReactivarCaso`, `abrirCasoFueraDeCobertura`; pierde `interesAdicional`. |
| `backend/src/mastra/tools/casos/derivar-tema-tool.ts` (crear) | Signal tool: el agente marca un asunto de otra área. `execute` no toca la DB. |
| `backend/src/mastra/dominios/*/index.ts` (modificar, ×5) | Registran `derivarTemaTool` en `buildTools`. |
| `backend/src/mastra/dominios/*/rules/conducta-*.ts` (modificar, ×5) | Separan `corregir-clasificacion` (error) de `derivar-tema` (tema nuevo). |
| `backend/src/mastra/common/memory/index.ts` (modificar) | Template de working memory: de un caso a N, con los hechos separados por caso. |
| `frontend/src/lib/chat-orchestrator.ts` (modificar) | Rutea por caso activo, engancha `derivar-tema`, deriva `pedidoContactoHecho` de la base. |
| `frontend/src/lib/chat-orchestrator-schemas.ts` (modificar) | `derivarTemaArgsSchema`; `registrarCasoArgsSchema` pierde `interesAdicional`. |
| `frontend/src/lib/board/conversaciones.ts` (modificar) | Detalle con N casos; listado ordenado por última actividad. |
| `frontend/src/lib/revision/sesiones.ts` (modificar) | `getCasoDeSesion` → `getCasosDeSesion`. |
| `frontend/src/components/board/Chats/DetalleChat.tsx` (modificar) | Renderiza N casos. |
| `frontend/src/components/board/Chats/ListadoChats.tsx` (modificar) | Columna de casos y fecha de última actividad. |
| `backend/src/test/agents/laboral/datasets/derivar-tema.json` (crear) | Eval del disparo de `derivar-tema` (y del no-disparo). |
| `frontend/tests/casos-multiples.spec.ts` (crear) | E2E: dos temas en un chat → dos casos en el board. |

**Ya resuelto, no hacer:** el spec §6 menciona eliminar `backend/src/test/instructions-migracion.test.ts` y su fixture. Ya no existen (borrados en `5cbe283`). No recrearlos.

---

### Task 1: Schema y migración

**Files:**
- Modify: `frontend/prisma/schema.prisma:67-118`
- Create: `frontend/prisma/migrations/<timestamp>_casos_multiples_por_conversacion/migration.sql`

**Interfaces:**
- Consumes: nada.
- Produces: modelo `Caso` con `conversationId` no único, `@@unique([conversationId, categoria])` (clave compuesta que Prisma expone como `conversationId_categoria`), `correccionAplicada: boolean`; modelo `Conversation` con `casoActivoId: string | null` y la relación `casos: Caso[]` (ya no `caso: Caso?`).

- [ ] **Step 1: Editar el modelo `Conversation`**

En `frontend/prisma/schema.prisma`, borrar el doc-comment y el campo `correccionAplicada` (líneas 76-78), insertar `casoActivoId` después de `clasificadaEn`, y cambiar `caso  Caso?` por `casos Caso[]`. Al desaparecer `correccionAplicada` (el nombre más largo del modelo), `prisma format` re-alinea todo el bloque. Resultado exacto:

```prisma
/// Business-side conversation record: routing state for the BFF. The message
/// history itself lives in Mastra storage (thread) — this row only pins the
/// conversation to a category (spec §6).
model Conversation {
  id             String          @id @default(cuid())
  sessionId      String          @unique
  threadId       String          @unique
  categoria      String?
  clasificadaEn  DateTime?
  /// Puntero al Caso que atiende el turno actual. Escalar suelto, sin relación
  /// Prisma (evita desambiguar dos relaciones Conversation<->Caso).
  casoActivoId   String?
  /// Sesión creada por el equipo legal en /revision. Los Caso de estas
  /// conversaciones se EXCLUYEN de toda métrica de negocio (join por este flag).
  esRevision     Boolean         @default(false)
  /// Nombre visible en el listado compartido de revisión.
  titulo         String?
  /// Nombre del experto que creó la sesión (listado compartido).
  creadaPor      String?
  /// Quién originó la sesión de revisión (null = conversación normal del home).
  origenRevision RevisionOrigen?
  /// Corrida autónoma aún no publicada: fuera del listado del equipo legal.
  borrador       Boolean         @default(false)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  casos Caso[]
  notas NotaRevision[]

  @@index([esRevision, createdAt(sort: Desc)])
}
```

- [ ] **Step 2: Editar el modelo `Caso`**

```prisma
/// The lead — THE deliverable of the system (vision §5). Built incrementally.
model Caso {
  id                 String     @id @default(cuid())
  conversationId     String
  categoria          String?
  subcategorias      String[]   @default([])
  resumen            Json?
  contactoNombre     String?
  contactoTelefono   String?
  contactoEmail      String?
  estado             CasoEstado @default(EN_CONVERSACION)
  origen             CasoOrigen @default(DOMINIO)
  /// Atomic guard for `corregirClasificacion`: flips false→true exactly once,
  /// enforced via a guarded `updateMany` (at most ONE correction POR CASO).
  correccionAplicada Boolean    @default(false)
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  eventos      CasoEvento[]

  @@unique([conversationId, categoria])
  @@index([estado, updatedAt(sort: Desc)])
}
```

No agregar `@@index([conversationId])`: en Postgres el índice de `@@unique([conversationId, categoria])` ya sirve de índice de prefijo para todo lookup por `conversationId` solo. (El spec §3 lo listaba; es redundante y se omite deliberadamente.)

- [ ] **Step 3: Generar la migración sin aplicarla**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm prisma migrate dev --create-only --name casos-multiples-por-conversacion
```

- [ ] **Step 4: Agregar el backfill al `migration.sql`**

Abrir el `migration.sql` recién generado y agregar al final, después del DDL:

```sql
-- Backfill: cada conversación adopta su Caso existente como activo.
UPDATE "Conversation" c
SET "casoActivoId" = k.id
FROM "Caso" k
WHERE k."conversationId" = c.id AND c."casoActivoId" IS NULL;
```

- [ ] **Step 5: Aplicar y regenerar el cliente**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm prisma migrate dev && pnpm prisma:generate
```

Verificar que la tabla quedó con tres índices (`Caso_pkey`, `Caso_conversationId_categoria_key`, `Caso_estado_updatedAt_idx`):

```bash
cd /home/bryan/LegalSeller/frontend && pnpm prisma db execute --stdin <<< '\d "Caso"'
```

- [ ] **Step 6: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(schema): Caso pasa a 1:N con Conversation, guard de corrección por caso"
```

---

### Task 2: Lectura del caso activo

**Files:**
- Modify: `frontend/src/lib/clasificacion.ts:1-27`
- Test: `frontend/src/lib/clasificacion.test.ts`

**Interfaces:**
- Consumes: schema de Task 1.
- Produces: `export interface CasoActivo { id: string; categoria: string | null; estado: "EN_CONVERSACION" | "CAPTADO" | "FUERA_DE_COBERTURA"; origen: "DOMINIO" | "FUERA_DE_COBERTURA"; correccionAplicada: boolean }`; `export async function resolverCasoActivo(sessionId: string): Promise<CasoActivo | null>`; `getOrCreateConversation` ahora devuelve `{ id, categoria, casoActivoId }`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `frontend/src/lib/clasificacion.test.ts`. Nota: el `tx` hoisted del archivo ya expone `caso.findFirst`; si no está, agregarlo al objeto de `vi.hoisted` (línea 10).

```ts
describe("resolverCasoActivo", () => {
  beforeEach(() => vi.resetAllMocks());

  it("devuelve null cuando la conversación todavía no tiene ningún caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: null });
    tx.caso.findFirst.mockResolvedValue(null);
    await expect(resolverCasoActivo("s1")).resolves.toBeNull();
  });

  it("resuelve el puntero a la fila del caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "CAPTADO",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    const caso = await resolverCasoActivo("s1");
    expect(caso).toEqual({
      id: "k1",
      categoria: "laboral",
      estado: "CAPTADO",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    expect(tx.caso.findFirst).not.toHaveBeenCalled();
  });

  it("auto-repara un puntero colgado adoptando el caso más reciente", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "borrado" });
    tx.caso.findUnique.mockResolvedValue(null);
    tx.caso.findFirst.mockResolvedValue({
      id: "k2",
      categoria: "familia",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    const caso = await resolverCasoActivo("s1");
    expect(caso?.id).toBe("k2");
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { casoActivoId: "k2" },
    });
  });
});
```

Y actualizar el test existente de `getOrCreateConversation` (líneas 276-288) para que el `select` esperado incluya `casoActivoId: true`.

Agregar `resolverCasoActivo` al import de la línea 17.

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/clasificacion.test.ts
```

Esperado: FAIL con `resolverCasoActivo is not a function`.

- [ ] **Step 3: Implementar**

En `frontend/src/lib/clasificacion.ts`, agregar el import de `Prisma` y los bloques nuevos arriba (después de `ESCAPES`):

```ts
import { Prisma } from "@prisma/client";
```

```ts
/** El Caso que atiende el turno: resolución del puntero Conversation.casoActivoId. */
export interface CasoActivo {
  id: string;
  categoria: string | null;
  estado: "EN_CONVERSACION" | "CAPTADO" | "FUERA_DE_COBERTURA";
  origen: "DOMINIO" | "FUERA_DE_COBERTURA";
  correccionAplicada: boolean;
}

const SELECT_CASO_ACTIVO = {
  id: true,
  categoria: true,
  estado: true,
  origen: true,
  correccionAplicada: true,
} as const;

/**
 * Contacto heredable entre casos de la MISMA conversación (spec §2): el Caso N
 * nace CAPTADO con los datos que el consultante ya dio, porque volver a pedirle
 * el teléfono a quien acaba de darlo destruye la confianza que sostiene el
 * funnel. Toma el CAPTADO más reciente, no el primero: si corrigió su teléfono
 * en el caso 2, el caso 3 hereda el corregido.
 */
async function contactoHeredable(
  tx: Prisma.TransactionClient,
  conversationId: string,
): Promise<{ contactoNombre: string | null; contactoTelefono: string | null; contactoEmail: string | null } | null> {
  return tx.caso.findFirst({
    where: { conversationId, estado: "CAPTADO" },
    orderBy: { updatedAt: "desc" },
    select: { contactoNombre: true, contactoTelefono: true, contactoEmail: true },
  });
}
```

Reemplazar `getOrCreateConversation` y agregar `resolverCasoActivo` justo después:

```ts
export async function getOrCreateConversation(
  sessionId: string,
): Promise<{ id: string; categoria: string | null; casoActivoId: string | null }> {
  return prisma.conversation.upsert({
    where: { sessionId },
    create: { sessionId, threadId: threadIdForSession(sessionId) },
    update: {},
    select: { id: true, categoria: true, casoActivoId: true },
  });
}

/**
 * El Caso que atiende el turno. Resuelve el puntero `Conversation.casoActivoId`
 * a la fila real, con auto-reparación: si el puntero quedó colgado adopta el
 * Caso más reciente de la conversación y lo reescribe, en vez de mandar el
 * turno al receptor y abrir un caso duplicado sobre la misma categoría.
 * Devuelve null SOLO cuando la conversación todavía no tiene ningún Caso: ese
 * es el único disparador legítimo del receptor inaugural.
 */
export async function resolverCasoActivo(sessionId: string): Promise<CasoActivo | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { sessionId },
    select: { id: true, casoActivoId: true },
  });
  if (!conversation) return null;

  if (conversation.casoActivoId) {
    const caso = await prisma.caso.findUnique({
      where: { id: conversation.casoActivoId },
      select: SELECT_CASO_ACTIVO,
    });
    if (caso) return caso;
  }

  const ultimo = await prisma.caso.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { updatedAt: "desc" },
    select: SELECT_CASO_ACTIVO,
  });
  if (!ultimo) return null;
  await prisma.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: ultimo.id } });
  return ultimo;
}
```

`contactoHeredable` queda sin usar hasta Task 4: agregarle `// eslint-disable-next-line @typescript-eslint/no-unused-vars` solo si `pnpm lint` se queja, y quitarlo en Task 4.

- [ ] **Step 4: Correr los tests**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/clasificacion.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/clasificacion.ts frontend/src/lib/clasificacion.test.ts
git commit -m "feat(casos): resolverCasoActivo con auto-reparación del puntero"
```

---

### Task 3: Escritura sobre el caso activo

**Files:**
- Modify: `frontend/src/lib/clasificacion.ts` (`asignarClasificacion`, `registrarDatosCaso`, `corregirClasificacion`)
- Modify: `frontend/src/lib/chat-orchestrator-schemas.ts:24-32`
- Test: `frontend/src/lib/clasificacion.test.ts`

**Interfaces:**
- Consumes: `CasoActivo`, `SELECT_CASO_ACTIVO`, `contactoHeredable` (Task 2).
- Produces: `asignarClasificacion(...): Promise<{ categoria: string | null; aplicada: boolean; casoId: string | null; casoEstado: "EN_CONVERSACION" | "CAPTADO" | "FUERA_DE_COBERTURA" | null }>`; `registrarDatosCaso` sin `interesAdicional`; `corregirClasificacion` con guard sobre `Caso`.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el `describe("corregirClasificacion")` existente (líneas 228-271) por:

```ts
describe("corregirClasificacion", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sin caso activo no corrige", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: null });
    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).resolves.toEqual({
      aplicada: false,
    });
  });

  it("no corrige hacia una categoría que ya tiene caso: eso es derivar-tema", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({ id: "k1", categoria: "laboral" })
      .mockResolvedValueOnce({ id: "k2" });
    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).resolves.toEqual({
      aplicada: false,
    });
    expect(tx.caso.updateMany).not.toHaveBeenCalled();
  });

  it("corrige el caso activo con guard atómico sobre Caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValueOnce({ id: "k1", categoria: "laboral" }).mockResolvedValueOnce(null);
    tx.caso.updateMany.mockResolvedValue({ count: 1 });
    await expect(corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "m" })).resolves.toEqual({
      aplicada: true,
    });
    expect(tx.caso.updateMany).toHaveBeenCalledWith({
      where: { id: "k1", correccionAplicada: false },
      data: { correccionAplicada: true, categoria: "familia" },
    });
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CORRECCION" }) }),
    );
  });
});

describe("registrarDatosCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("escribe sobre el caso activo y no acepta interesAdicional", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValue({ id: "k1", subcategorias: ["despido"], resumen: { hechos: "previo" } });
    await registrarDatosCaso({ sessionId: "s1", subcategorias: ["rubros-laborales"], hechos: "nuevo" });
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k1" },
        data: expect.objectContaining({
          subcategorias: ["despido", "rubros-laborales"],
          resumen: { hechos: "previo\nnuevo" },
        }),
      }),
    );
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });

  it("sin caso activo abre el de la categoría persistida y mueve el puntero", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: null });
    tx.caso.upsert.mockResolvedValue({ id: "k9", subcategorias: [], resumen: null });
    await registrarDatosCaso({ sessionId: "s1", contactoNombre: "Ana" });
    expect(tx.caso.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId_categoria: { conversationId: "c1", categoria: "laboral" } },
      }),
    );
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k9" } });
    expect(tx.caso.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "CAPTADO" }) }),
    );
  });
});
```

Agregar `caso.updateMany: vi.fn()` y `caso.findFirst: vi.fn()` al objeto `tx` de `vi.hoisted`.

- [ ] **Step 2: Correr para verificar que fallan**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/clasificacion.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Implementar `registrarDatosCaso`**

```ts
/**
 * Incremental lead capture: merges data as it appears. Escribe siempre sobre el
 * CASO ACTIVO. Sin caso activo (registrar-caso del receptor para captación
 * fuera de cobertura, antes de que exista clasificación) abre el caso de la
 * categoría persistida y deja el puntero apuntándolo.
 */
export async function registrarDatosCaso(params: {
  sessionId: string;
  subcategorias?: string[];
  hechos?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, casoActivoId: true },
    });
    if (!conversation) return;

    const casoActivo = conversation.casoActivoId
      ? await tx.caso.findUnique({
          where: { id: conversation.casoActivoId },
          select: { id: true, subcategorias: true, resumen: true },
        })
      : null;

    // Sin caso activo: upsert por la clave compuesta cuando hay categoría
    // persistida (dos registrar-caso concurrentes de la misma categoría no
    // duplican). Con categoria null NO se puede usar la clave compuesta
    // —Prisma la tipa `categoria: string`— así que va create directo.
    const caso =
      casoActivo ??
      (conversation.categoria
        ? await tx.caso.upsert({
            where: {
              conversationId_categoria: { conversationId: conversation.id, categoria: conversation.categoria },
            },
            create: { conversationId: conversation.id, categoria: conversation.categoria },
            update: {},
            select: { id: true, subcategorias: true, resumen: true },
          })
        : await tx.caso.create({
            data: { conversationId: conversation.id, categoria: null },
            select: { id: true, subcategorias: true, resumen: true },
          }));

    if (!casoActivo) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: caso.id } });
    }

    const subcategorias = params.subcategorias
      ? Array.from(new Set([...caso.subcategorias, ...params.subcategorias]))
      : undefined;
    const resumenPrevio = (caso.resumen as Record<string, unknown> | null) ?? {};
    const hechosPrevios = typeof resumenPrevio.hechos === "string" ? `${resumenPrevio.hechos}\n` : "";

    const tieneContacto = Boolean(params.contactoNombre || params.contactoTelefono || params.contactoEmail);
    await tx.caso.update({
      where: { id: caso.id },
      data: {
        ...(subcategorias ? { subcategorias } : {}),
        resumen: {
          ...resumenPrevio,
          ...(params.hechos ? { hechos: `${hechosPrevios}${params.hechos}` } : {}),
        },
        ...(params.contactoNombre ? { contactoNombre: params.contactoNombre } : {}),
        ...(params.contactoTelefono ? { contactoTelefono: params.contactoTelefono } : {}),
        ...(params.contactoEmail ? { contactoEmail: params.contactoEmail } : {}),
        ...(tieneContacto ? { estado: "CAPTADO" } : {}),
      },
    });
    await tx.casoEvento.create({
      data: {
        casoId: caso.id,
        tipo: tieneContacto ? "CONTACTO" : "REGISTRO_DATO",
        payload: JSON.parse(JSON.stringify(params)) as object,
      },
    });
  });
}
```

- [ ] **Step 4: Implementar `corregirClasificacion`**

```ts
/**
 * Bounded reclassification: a lo sumo UNA corrección por CASO, atómica vía el
 * guard `correccionAplicada` sobre `Caso`. Corrige el caso ACTIVO: abrir un tema
 * nuevo es `derivar-tema`, no una corrección. El `CasoEvento` es auditoría, no
 * el guard.
 */
export async function corregirClasificacion(params: {
  sessionId: string;
  categoria: string;
  motivo: string;
}): Promise<{ aplicada: boolean }> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, casoActivoId: true },
    });
    if (!conversation?.casoActivoId) return { aplicada: false };

    const caso = await tx.caso.findUnique({
      where: { id: conversation.casoActivoId },
      select: { id: true, categoria: true },
    });
    if (!caso) return { aplicada: false };

    // Si la categoría destino YA tiene caso en esta conversación, corregir
    // violaría @@unique([conversationId, categoria]) y abortaría la transacción
    // entera con P2002. Eso no es una corrección: es un tema ya abierto, y el
    // camino correcto es derivar-tema.
    const colision = await tx.caso.findUnique({
      where: { conversationId_categoria: { conversationId: conversation.id, categoria: params.categoria } },
      select: { id: true },
    });
    if (colision) return { aplicada: false };

    const updated = await tx.caso.updateMany({
      where: { id: caso.id, correccionAplicada: false },
      data: { correccionAplicada: true, categoria: params.categoria },
    });
    if (updated.count === 0) return { aplicada: false };

    await tx.casoEvento.create({
      data: {
        casoId: caso.id,
        tipo: "CORRECCION",
        payload: { de: caso.categoria, a: params.categoria, motivo: params.motivo },
      },
    });
    // La denormalización de la conversación sigue al caso activo.
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { categoria: params.categoria, clasificadaEn: new Date() },
    });
    return { aplicada: true };
  });
}
```

- [ ] **Step 5: Ampliar el retorno de `asignarClasificacion`**

Cambiar la firma a `Promise<{ categoria: string | null; aplicada: boolean; casoId: string | null; casoEstado: "EN_CONVERSACION" | "CAPTADO" | "FUERA_DE_COBERTURA" | null }>`, sumar `casoActivoId: true` al `select` de la conversación, devolver `casoId`/`casoEstado` en los early-returns (`casoId: null, casoEstado: null` cuando no hay conversación) y, al final del camino exitoso, apuntar el puntero con `await tx.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: caso.id } })` y releer el estado del caso para devolverlo.

La búsqueda del caso existente pasa a la clave compuesta, salvo para escapes (Prisma tipa `categoria` como `string` dentro de `conversationId_categoria`, y dos NULL no unifican):

```ts
    const casoActivo = conversation.casoActivoId
      ? await tx.caso.findUnique({
          where: { id: conversation.casoActivoId },
          select: { id: true, categoria: true, origen: true, subcategorias: true, resumen: true },
        })
      : null;
    let casoExistente = esEscape
      ? null
      : ((await tx.caso.findUnique({
          where: { conversationId_categoria: { conversationId: conversation.id, categoria: params.categoria } },
          select: { id: true, categoria: true, origen: true, subcategorias: true, resumen: true },
        })) ??
          // Promote: el caso activo puede ser el que dejó congelado un escape
          // previo (categoria null). Se promueve en vez de abrir uno nuevo.
          (casoActivo?.categoria === null && casoActivo.origen === "FUERA_DE_COBERTURA" ? casoActivo : null));
```

El `catch` de P2002 re-lee por la misma clave compuesta.

**Resolución del 2026-08-05 (escapes repetidos)**: en el camino inaugural, un escape **reusa** el Caso `FUERA_DE_COBERTURA` que ya está activo en vez de crear uno nuevo. El criterio es de qué información dispone cada camino: acá nadie afirmó que el tema sea distinto (puede ser la misma consulta reformulada), mientras que en la derivación de Task 4 el agente lo marcó explícitamente con `derivar-tema` — por eso `abrirCasoFueraDeCobertura` sí crea siempre. Crear siempre en los dos lados inflaría la métrica de demanda no cubierta, que es justamente la que el producto quiere medir bien.

- [ ] **Step 6: Quitar `interesAdicional` del schema del BFF**

En `frontend/src/lib/chat-orchestrator-schemas.ts`, borrar la línea `interesAdicional: z.string().optional(),` de `registrarCasoArgsSchema`.

- [ ] **Step 7: Correr los tests**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/clasificacion.test.ts && pnpm lint
```

Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/clasificacion.ts frontend/src/lib/clasificacion.test.ts frontend/src/lib/chat-orchestrator-schemas.ts
git commit -m "feat(casos): escritura sobre el caso activo y guard de corrección por caso"
```

---

### Task 4: Apertura y reactivación de casos

**Files:**
- Modify: `frontend/src/lib/clasificacion.ts`
- Test: `frontend/src/lib/clasificacion.test.ts`

**Interfaces:**
- Consumes: `CasoActivo`, `SELECT_CASO_ACTIVO`, `contactoHeredable`, `ESCAPES` (Tasks 2-3).
- Produces: `export type ResultadoDerivacion = { accion: "sin-conversacion" } | { accion: "no-op" | "reactivado" | "creado"; casoId: string; categoria: string | null }`; `export async function abrirOReactivarCaso(params: { sessionId: string; categoria: string; subcategoria?: string; brief?: string }): Promise<ResultadoDerivacion>`; `export async function abrirCasoFueraDeCobertura(params: { sessionId: string; temaDetectado: string; brief?: string }): Promise<ResultadoDerivacion>`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
describe("abrirOReactivarCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("falso positivo: misma categoría que el caso activo es no-op", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    await expect(abrirOReactivarCaso({ sessionId: "s1", categoria: "laboral" })).resolves.toEqual({
      accion: "no-op",
      casoId: "k1",
      categoria: "laboral",
    });
    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });

  it("reactiva el caso de una categoría ya presente sin crear otro", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: "laboral",
        estado: "CAPTADO",
        origen: "DOMINIO",
        correccionAplicada: false,
      })
      .mockResolvedValueOnce({ id: "k2", categoria: "familia" });
    const resultado = await abrirOReactivarCaso({ sessionId: "s1", categoria: "familia" });
    expect(resultado).toEqual({ accion: "reactivado", casoId: "k2", categoria: "familia" });
    expect(tx.caso.create).not.toHaveBeenCalled();
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k2" } });
  });

  it("crea el caso de una categoría nueva heredando el contacto: nace CAPTADO", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: "laboral",
        estado: "CAPTADO",
        origen: "DOMINIO",
        correccionAplicada: false,
      })
      .mockResolvedValueOnce(null);
    tx.caso.findFirst.mockResolvedValue({
      contactoNombre: "Ana",
      contactoTelefono: "099",
      contactoEmail: null,
    });
    tx.caso.create.mockResolvedValue({ id: "k3" });
    const resultado = await abrirOReactivarCaso({ sessionId: "s1", categoria: "transito", subcategoria: undefined });
    expect(resultado).toEqual({ accion: "creado", casoId: "k3", categoria: "transito" });
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoria: "transito",
          contactoNombre: "Ana",
          contactoTelefono: "099",
          estado: "CAPTADO",
        }),
      }),
    );
    expect(tx.conversation.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { casoActivoId: "k3" } });
  });

  it("sin contacto heredable el caso nuevo nace EN_CONVERSACION", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findUnique
      .mockResolvedValueOnce({
        id: "k1",
        categoria: "laboral",
        estado: "EN_CONVERSACION",
        origen: "DOMINIO",
        correccionAplicada: false,
      })
      .mockResolvedValueOnce(null);
    tx.caso.findFirst.mockResolvedValue(null);
    tx.caso.create.mockResolvedValue({ id: "k4" });
    await abrirOReactivarCaso({ sessionId: "s1", categoria: "familia" });
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: "EN_CONVERSACION" }) }),
    );
  });
});

describe("abrirCasoFueraDeCobertura", () => {
  beforeEach(() => vi.resetAllMocks());

  it("siempre crea un caso nuevo: cada demanda no cubierta es una señal separada", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    tx.caso.findFirst.mockResolvedValue(null);
    tx.caso.create.mockResolvedValue({ id: "k5" });
    const resultado = await abrirCasoFueraDeCobertura({ sessionId: "s1", temaDetectado: "penal" });
    expect(resultado).toEqual({ accion: "creado", casoId: "k5", categoria: null });
    expect(tx.caso.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoria: null,
          origen: "FUERA_DE_COBERTURA",
          estado: "FUERA_DE_COBERTURA",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Correr para verificar que fallan**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/clasificacion.test.ts
```

Esperado: FAIL con `abrirOReactivarCaso is not a function`.

- [ ] **Step 3: Implementar**

```ts
/** Qué hizo la derivación con el puntero — el orquestador loguea sobre esto. */
export type ResultadoDerivacion =
  | { accion: "sin-conversacion" }
  /** Falso positivo del agente: el receptor clasificó en la categoría del caso activo. Inofensivo por diseño. */
  | { accion: "no-op"; casoId: string; categoria: string | null }
  | { accion: "reactivado"; casoId: string; categoria: string | null }
  | { accion: "creado"; casoId: string; categoria: string | null };

/**
 * Abre o reactiva el Caso de una categoría distinta a la del caso activo, y
 * mueve `Conversation.casoActivoId` (spec §4). Tres ramas:
 *   - misma categoría que el caso activo -> no-op (falso positivo del agente).
 *   - categoría ya presente en la conversación -> reactiva ese Caso con sus
 *     hechos acumulados; "volvamos a lo del divorcio" sale gratis por acá.
 *   - categoría nueva -> crea Caso N heredando el contacto, que nace CAPTADO
 *     (spec §2: no se le vuelve a pedir el teléfono a quien ya lo dio).
 * La unicidad compuesta es la red: aunque el receptor devuelva dos veces la
 * misma categoría, la base rechaza el duplicado.
 */
export async function abrirOReactivarCaso(params: {
  sessionId: string;
  categoria: string;
  subcategoria?: string;
  brief?: string;
}): Promise<ResultadoDerivacion> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, casoActivoId: true },
    });
    if (!conversation) return { accion: "sin-conversacion" };

    const casoActivo = conversation.casoActivoId
      ? await tx.caso.findUnique({ where: { id: conversation.casoActivoId }, select: SELECT_CASO_ACTIVO })
      : null;

    if (casoActivo?.categoria === params.categoria) {
      return { accion: "no-op", casoId: casoActivo.id, categoria: casoActivo.categoria };
    }

    const existente = await tx.caso.findUnique({
      where: { conversationId_categoria: { conversationId: conversation.id, categoria: params.categoria } },
      select: { id: true, categoria: true },
    });
    if (existente) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: existente.id } });
      return { accion: "reactivado", casoId: existente.id, categoria: existente.categoria };
    }

    const contacto = await contactoHeredable(tx, conversation.id);
    const creado = await tx.caso.create({
      data: {
        conversationId: conversation.id,
        categoria: params.categoria,
        subcategorias: params.subcategoria ? [params.subcategoria] : [],
        resumen: params.brief ? { brief: params.brief } : undefined,
        contactoNombre: contacto?.contactoNombre ?? null,
        contactoTelefono: contacto?.contactoTelefono ?? null,
        contactoEmail: contacto?.contactoEmail ?? null,
        estado: contacto ? "CAPTADO" : "EN_CONVERSACION",
        origen: "DOMINIO",
      },
      select: { id: true },
    });
    await tx.conversation.update({ where: { id: conversation.id }, data: { casoActivoId: creado.id } });
    await tx.casoEvento.create({
      data: { casoId: creado.id, tipo: "CLASIFICACION", payload: { categoria: params.categoria, via: "derivar-tema" } },
    });
    return { accion: "creado", casoId: creado.id, categoria: params.categoria };
  });
}

/**
 * Demanda fuera de cobertura detectada durante la conversación. SIEMPRE crea un
 * Caso nuevo con `categoria: null`: en Postgres dos NULL no unifican bajo la
 * clave compuesta, y eso es lo correcto — cada tema no cubierto es una señal de
 * mercado separada (spec §3). El puntero NO se mueve: no hay agente que atienda
 * esa categoría, así que el turno siguiente sigue en el caso que venía.
 */
export async function abrirCasoFueraDeCobertura(params: {
  sessionId: string;
  temaDetectado: string;
  brief?: string;
}): Promise<ResultadoDerivacion> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true },
    });
    if (!conversation) return { accion: "sin-conversacion" };

    const contacto = await contactoHeredable(tx, conversation.id);
    const creado = await tx.caso.create({
      data: {
        conversationId: conversation.id,
        categoria: null,
        resumen: { brief: params.brief ?? params.temaDetectado, temaDetectado: params.temaDetectado },
        contactoNombre: contacto?.contactoNombre ?? null,
        contactoTelefono: contacto?.contactoTelefono ?? null,
        contactoEmail: contacto?.contactoEmail ?? null,
        estado: "FUERA_DE_COBERTURA",
        origen: "FUERA_DE_COBERTURA",
      },
      select: { id: true },
    });
    return { accion: "creado", casoId: creado.id, categoria: null };
  });
}
```

- [ ] **Step 4: Correr los tests**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/clasificacion.test.ts && pnpm lint
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/clasificacion.ts frontend/src/lib/clasificacion.test.ts
git commit -m "feat(casos): abrirOReactivarCaso con herencia de contacto"
```

---

### Task 5: Signal tool `derivar-tema`

**Files:**
- Create: `backend/src/mastra/tools/casos/derivar-tema-tool.ts`
- Create: `backend/src/mastra/tools/casos/derivar-tema-tool.test.ts`
- Modify: `backend/src/mastra/dominios/{laboral,familia,transito,arrendamiento-desalojo,relaciones-consumo}/index.ts`
- Modify: `backend/src/mastra/tools/casos/registrar-caso-tool.ts` (sacar `interesAdicional`)

**Interfaces:**
- Consumes: nada.
- Produces: `derivarTemaTool` con `id: "derivar-tema"`, `inputSchema: z.object({ tema: z.string().min(1) })`, `outputSchema: z.object({ status: z.enum(["ok", "error"]), mensaje: z.string() })`.

**Agregado el 2026-08-05 (hueco detectado ejecutando Task 3):** el plan original sacaba `interesAdicional` del schema Zod del BFF (Task 3 Step 6) pero **no** del `inputSchema` de la tool en el backend. Sin este paso la tool le sigue ofreciendo el campo al agente y el BFF lo descarta en silencio — el peor de los dos mundos. Va acá, con la tool nueva, porque es un cambio de contrato de tool y no de prompt.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/mastra/tools/casos/derivar-tema-tool.test.ts`, calcado de `registrar-caso-tool.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { derivarTemaTool } from "./derivar-tema-tool.js";

describe("derivarTemaTool", () => {
  it("se publica con el id que observa el BFF", () => {
    expect(derivarTemaTool.id).toBe("derivar-tema");
  });

  it("exige el tema en las palabras del usuario", () => {
    expect(derivarTemaTool.inputSchema.safeParse({ tema: "" }).success).toBe(false);
    expect(derivarTemaTool.inputSchema.safeParse({}).success).toBe(false);
    expect(derivarTemaTool.inputSchema.safeParse({ tema: "me chocaron el auto" }).success).toBe(true);
  });

  it("nunca tira: devuelve el contrato de status", async () => {
    const resultado = await derivarTemaTool.execute({ context: { tema: "me chocaron" } });
    expect(resultado.status).toBe("ok");
    expect(typeof resultado.mensaje).toBe("string");
  });
});
```

Si la firma de `execute` en la versión de `@mastra/core` del proyecto difiere, copiar exactamente la del test de `registrar-caso-tool.test.ts`.

- [ ] **Step 2: Correr para verificar que falla**

```bash
cd /home/bryan/LegalSeller/backend && pnpm exec vitest run src/mastra/tools/casos/derivar-tema-tool.test.ts
```

Esperado: FAIL, no resuelve el módulo.

- [ ] **Step 3: Crear la tool**

```ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * Signal tool: el agente MARCA un asunto de otra área; el receptor clasifica.
 * El BFF observa el tool-call en el stream SSE y corre el receptor sobre el
 * MISMO mensaje del usuario — execute no toca la DB. Un falso positivo es
 * inofensivo (el receptor lo clasifica en la misma categoría y no se abre
 * ningún caso), así que el contrato favorece marcar de más.
 */
export const derivarTemaTool = createTool({
  id: "derivar-tema",
  description: `Marcá que el usuario trajo un asunto de OTRA área legal, además del que venís atendiendo. Pasá el tema en las palabras del usuario: la clasificación no la hacés vos.`,
  inputSchema: z.object({
    tema: z.string().min(1).meta({ description: "El asunto nuevo en las palabras del usuario" }),
  }),
  // Las dos ramas comparten shape, así que un enum alcanza y evita la unión.
  outputSchema: z.object({ status: z.enum(["ok", "error"]), mensaje: z.string() }),
  // eslint-disable-next-line @typescript-eslint/require-await
  execute: async () => ({
    status: "ok" as const,
    mensaje:
      "Tema derivado. Cerrá con una frase puente que reconozca el asunto nuevo; el especialista que corresponde entra en el próximo mensaje.",
  }),
});
```

- [ ] **Step 4: Registrar la tool en los cinco agentes**

En cada `backend/src/mastra/dominios/<categoria>/index.ts`, agregar el import **antes** del de `registrar-caso-tool.js` (orden alfabético: `casos/derivar-tema-tool.js` < `casos/registrar-caso-tool.js`, exigido por `import-x/order`):

```ts
import { derivarTemaTool } from "../../tools/casos/derivar-tema-tool.js";
```

Y en `buildTools`, después de `corregirClasificacionTool` y antes del spread:

```ts
    [derivarTemaTool.id]: derivarTemaTool,
```

El receptor (`dominios/recepcion/index.ts`) **no** lleva esta tool.

- [ ] **Step 4b: Sacar `interesAdicional` de `registrar-caso-tool.ts`**

Borrar del `inputSchema` la línea:

```ts
      interesAdicional: z.string().optional().meta({ description: "Tema extra fuera de la categoría de la conversación" }),
```

Y de la `description` de la tool, sacar `intereses adicionales` de la enumeración, que queda: `Registrá datos del caso APENAS aparezcan en la conversación: hechos relevantes, subcategorías detectadas y datos de contacto.`

Ojo con el `.refine()` que sigue al objeto: valida que venga al menos un campo. Verificá que su lógica no nombre `interesAdicional`; si lo nombra, sacarlo de ahí también. Los cuatro tests de `registrar-caso-tool.test.ts` cubren ese refine — corrélos.

- [ ] **Step 5: Correr los tests y el lint**

```bash
cd /home/bryan/LegalSeller/backend && pnpm test && pnpm lint
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mastra/tools/casos backend/src/mastra/dominios
git commit -m "feat(agentes): tool derivar-tema para marcar un asunto de otra área"
```

---

### Task 6: Prompts — rules y working memory

**Files:**
- Modify: `backend/src/mastra/dominios/laboral/rules/conducta-laboral.ts:15`
- Modify: `backend/src/mastra/dominios/familia/rules/conducta-familia.ts:24`
- Modify: `backend/src/mastra/dominios/transito/rules/conducta-transito.ts:23`
- Modify: `backend/src/mastra/dominios/arrendamiento-desalojo/rules/conducta-arrendamiento.ts:26`
- Modify: `backend/src/mastra/dominios/relaciones-consumo/rules/conducta-consumo.ts:24`
- Modify: `backend/src/mastra/common/memory/index.ts:5-12`
- Modify: `backend/src/mastra/tools/clasificacion/corregir-clasificacion-tool.ts:16`

**Interfaces:**
- Consumes: `derivarTemaTool` (Task 5).
- Produces: prompts que enseñan la distinción entre corregir y derivar. Sin cambios de firma.

- [ ] **Step 1: Reescribir la línea en las cinco rules**

En cada archivo, reemplazar la línea única:

```
- Si es evidente que la conversación fue mal clasificada (el problema real es de otra área), usá corregir-clasificacion (disponible una sola vez). Un tema adicional NO es un error de clasificación: registralo como interesAdicional.
```

por estas dos, idénticas en las cinco:

```
- Si es evidente que la conversación fue mal clasificada (el problema real es de otra área y no queda nada de la consulta original), usá corregir-clasificacion: eso corrige el caso en curso y está disponible una sola vez por caso.
- Cuando el usuario SUMA un asunto de otra área sin que se caiga el que venías atendiendo, usá derivar-tema pasando el tema en sus palabras — clasificarlo no es tu trabajo. Cada asunto es un caso propio que puede tomar un abogado distinto, así que el que no marcás se pierde; ante la duda marcá, porque si el tema termina siendo de tu área no pasa nada. Después de marcarlo, cerrá con una frase puente que reconozca el asunto nuevo: el especialista que corresponde entra en el próximo mensaje.
```

El bloque `<ejemplos>` de cada rule queda intacto.

- [ ] **Step 2: Ajustar la descripción de `corregir-clasificacion`**

En `backend/src/mastra/tools/clasificacion/corregir-clasificacion-tool.ts:16`, reemplazar la frase final `Un tema ADICIONAL no es un error: registralo con registrar-caso (interesAdicional).` por `Un tema ADICIONAL no es un error: marcalo con derivar-tema.` y cambiar "por conversación" por "por caso" donde aparezca.

- [ ] **Step 3: Reescribir el template de working memory**

En `backend/src/mastra/common/memory/index.ts`:

```ts
const WORKING_MEMORY_TEMPLATE = `# Casos en curso

## Caso que estás atendiendo
- Categoría:
- Hechos y fechas relatados:
- Subcategorías detectadas:

## Otros casos abiertos en esta conversación
- (una línea por caso: categoría — qué contó el usuario. Sus hechos NO son del caso que atendés ahora)

## Datos del consultante (comunes a todos los casos)
- Datos de contacto ya aportados:
- Preferencias de respuesta:
`;
```

Desaparece la línea "Intereses adicionales" junto con el concepto.

- [ ] **Step 4: Actualizar los tests de prompt que asertan sobre el contenido**

Correr y ajustar los `toEqual` de `activatedIds` y las aserciones de contenido:

```bash
cd /home/bryan/LegalSeller/backend && pnpm test
```

Los archivos candidatos a tocar son `src/mastra/dominios/laboral/instructions.test.ts` y `src/mastra/rules/index.test.ts`. Si un test asertaba la frase vieja, actualizarlo a la nueva; no relajar la aserción a un `toContain` genérico.

- [ ] **Step 5: Correr evals de regresión de voz**

```bash
cd /home/bryan/LegalSeller/backend && pnpm evals voz-fuentes
```

Esperado: no baja respecto del histórico. Si baja, el texto nuevo está compitiendo con una rule vecina — auditar el ensamblado, no el archivo suelto.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mastra
git commit -m "feat(prompts): separar corregir-clasificacion de derivar-tema en las cinco categorías"
```

---

### Task 7: Orquestación del turno

**Files:**
- Modify: `frontend/src/lib/chat-orchestrator.ts`
- Modify: `frontend/src/lib/chat-orchestrator-schemas.ts` (agregar al final)
- Modify: `frontend/src/lib/pedido-contacto.ts` (solo el doc-comment)
- Test: `frontend/src/lib/chat-orchestrator.test.ts`

**Interfaces:**
- Consumes: `resolverCasoActivo`, `abrirOReactivarCaso`, `abrirCasoFueraDeCobertura` (Tasks 2-4); `derivar-tema` observable en el stream (Task 5).
- Produces: `derivarTemaArgsSchema = z.object({ tema: z.string().min(1) })`; `callCategoryAgent` con `pedidoContactoHecho: boolean` obligatorio; `pipeCategoryTurn` con `message` y `categoriaActiva`.

- [ ] **Step 1: Escribir los tests que fallan**

Eliminar los dos tests de derivación léxica de `pedidoContactoHecho` (líneas 70-87) y agregar:

```ts
it("rutea por el caso activo, no por Conversation.categoria", async () => {
  clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
  clasificacion.resolverCasoActivo.mockResolvedValue({
    id: "k1",
    categoria: "familia",
    estado: "CAPTADO",
    origen: "DOMINIO",
    correccionAplicada: false,
  });
  dominios.esCategoriaHabilitada.mockResolvedValue(true);
  agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));

  await drain(await orchestrateChatTurn({ sessionId: "s1", message: "consulta" }));

  expect(agentService.streamAgentMessage).toHaveBeenCalledWith(
    expect.objectContaining({ agentId: "familia", pedidoContactoHecho: true }),
  );
});

it("observa derivar-tema y corre el receptor sobre el mismo mensaje", async () => {
  clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
  clasificacion.resolverCasoActivo.mockResolvedValue({
    id: "k1",
    categoria: "laboral",
    estado: "EN_CONVERSACION",
    origen: "DOMINIO",
    correccionAplicada: false,
  });
  dominios.esCategoriaHabilitada.mockResolvedValue(true);
  dominios.subcategoriaUnica.mockResolvedValue(null);
  agentService.streamAgentMessage
    .mockResolvedValueOnce(
      sseResponse([
        { type: "tool-call", payload: { toolName: "derivar-tema", args: { tema: "me chocaron el auto" } } },
        { type: "text-delta", payload: { text: "puente" } },
      ]),
    )
    .mockResolvedValueOnce(
      sseResponse([
        {
          type: "tool-call",
          payload: { toolName: "asignar-clasificacion", args: { categoria: "transito", brief: "choque" } },
        },
      ]),
    );

  await drain(await orchestrateChatTurn({ sessionId: "s1", message: "también me chocaron" }));

  expect(agentService.streamAgentMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ agentId: "recepcion", message: "también me chocaron", memoryReadOnly: true }),
  );
  expect(clasificacion.abrirOReactivarCaso).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "s1", categoria: "transito" }),
  );
});

it("falso positivo del agente: el receptor clasifica igual y no se abre caso", async () => {
  clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
  clasificacion.resolverCasoActivo.mockResolvedValue({
    id: "k1",
    categoria: "laboral",
    estado: "EN_CONVERSACION",
    origen: "DOMINIO",
    correccionAplicada: false,
  });
  dominios.esCategoriaHabilitada.mockResolvedValue(true);
  agentService.streamAgentMessage
    .mockResolvedValueOnce(
      sseResponse([{ type: "tool-call", payload: { toolName: "derivar-tema", args: { tema: "licencias" } } }]),
    )
    .mockResolvedValueOnce(
      sseResponse([
        { type: "tool-call", payload: { toolName: "asignar-clasificacion", args: { categoria: "laboral" } } },
      ]),
    );

  await drain(await orchestrateChatTurn({ sessionId: "s1", message: "y las licencias?" }));

  expect(clasificacion.abrirOReactivarCaso).not.toHaveBeenCalled();
});
```

Agregar `resolverCasoActivo`, `abrirOReactivarCaso` y `abrirCasoFueraDeCobertura` al objeto `clasificacion` de `vi.hoisted`, y sacar `fetchAssistantTexts` de `agentService`.

- [ ] **Step 2: Correr para verificar que fallan**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/chat-orchestrator.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Agregar el schema de args**

Al final de `frontend/src/lib/chat-orchestrator-schemas.ts`:

```ts
export const derivarTemaArgsSchema = z.object({ tema: z.string().min(1) });
export type DerivarTemaArgs = z.infer<typeof derivarTemaArgsSchema>;
```

- [ ] **Step 4: Ajustar imports y `runReceptor`**

En `frontend/src/lib/chat-orchestrator.ts`: sacar `fetchAssistantTexts` del import de `./agent-service`, borrar el import de `contienePedidoContacto`, agregar `derivarTemaArgsSchema` y las funciones nuevas de `./clasificacion`.

`runReceptor` gana un flag para la segunda corrida:

```ts
async function runReceptor(params: {
  sessionId: string;
  message: string;
  persistirRegistrarCaso?: boolean;
}): Promise<ReceptorOutcome> {
```

Y como primera línea de la rama `if (toolName === "registrar-caso")`:

```ts
        // En la corrida de derivación el puntero casoActivoId todavía apunta al
        // Caso viejo: persistir acá escribiría datos del tema NUEVO sobre el
        // caso VIEJO.
        if (params.persistirRegistrarCaso === false) return;
```

- [ ] **Step 5: Agregar `derivarTema`**

Entre `runReceptor` y `pipeCategoryTurn`:

```ts
/**
 * Segundo paso del escalamiento (spec §4): el agente de categoría marcó
 * `derivar-tema`, así que el receptor clasifica el MISMO mensaje del usuario y
 * el puntero `casoActivoId` se mueve. El agente marca, el receptor decide: un
 * falso positivo del agente es no-op. Nunca tira — corre con la respuesta del
 * turno ya streameada.
 */
async function derivarTema(params: {
  sessionId: string;
  message: string;
  categoriaActiva: string;
  tema: string;
}): Promise<void> {
  let outcome: ReceptorOutcome;
  try {
    outcome = await runReceptor({
      sessionId: params.sessionId,
      message: params.message,
      persistirRegistrarCaso: false,
    });
  } catch (error: unknown) {
    logger.error("receptor de derivación falló", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  // El texto del receptor se DESCARTA: el cliente ya recibió la respuesta
  // puente del agente y este turno no se appendea al thread.
  if (!outcome.args) return;
  const derivada = outcome.args;
  if (derivada.categoria === params.categoriaActiva) return;
  if (ESCAPES.has(derivada.categoria) || !(await esCategoriaHabilitada(derivada.categoria))) {
    await abrirCasoFueraDeCobertura({
      sessionId: params.sessionId,
      temaDetectado: derivada.temaDetectado ?? derivada.categoria,
      brief: derivada.brief ?? params.tema,
    });
    return;
  }
  const subcategoria = derivada.subcategoria ?? (await subcategoriaUnica(derivada.categoria)) ?? undefined;
  await abrirOReactivarCaso({
    sessionId: params.sessionId,
    categoria: derivada.categoria,
    subcategoria,
    brief: derivada.brief ?? params.tema,
  });
}
```

- [ ] **Step 6: Enganchar en `pipeCategoryTurn`**

Firma nueva: `function pipeCategoryTurn(params: { sessionId: string; message: string; categoriaActiva: string; upstream: Response }): Response`.

Dentro de `start(controller)`, junto a `const encoder`, declarar `let temaDerivado: string | null = null;`. Agregar como última rama del if/else de `onToolCall`:

```ts
            } else if (toolName === "derivar-tema") {
              const parsed = derivarTemaArgsSchema.safeParse(args);
              if (!parsed.success) {
                logger.warn("tool-call args failed validation", { toolName });
                return;
              }
              // Se ANOTA, no se ejecuta: el receptor corre una sola vez por
              // turno y recién con el stream del agente drenado.
              temaDerivado ??= parsed.data.tema;
            }
```

Y encadenar la derivación **antes** de cerrar el controller:

```ts
        .then(async () => {
          // Va ANTES de cerrar el controller a propósito: el texto del agente ya
          // salió completo hacia el cliente, y mantener el stream abierto hasta
          // que el puntero se movió es lo único que evita la carrera con el
          // turno siguiente — tanto el chat como el runner de escenarios mandan
          // el próximo mensaje recién cuando este stream cierra.
          if (temaDerivado === null) return;
          await derivarTema({
            sessionId: params.sessionId,
            message: params.message,
            categoriaActiva: params.categoriaActiva,
            tema: temaDerivado,
          });
        })
        .catch((error: unknown) => {
          logger.error("derivación de tema falló", {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
```

- [ ] **Step 7: `callCategoryAgent` sin escaneo léxico**

Borrar el bloque `const pedidoContactoHecho = await fetchAssistantTexts(...)` completo (comentario incluido) y recibirlo por parámetro:

```ts
async function callCategoryAgent(params: {
  sessionId: string;
  categoria: string;
  message: string;
  casoBrief?: string;
  /** Hecho de la base, no heurística: el Caso activo ya está CAPTADO (spec §5). */
  pedidoContactoHecho: boolean;
}): Promise<Response> {
```

y al final `return pipeCategoryTurn({ sessionId: params.sessionId, message: params.message, categoriaActiva: params.categoria, upstream });`

- [ ] **Step 8: Rutear por el caso activo en `orchestrateChatTurn`**

Reemplazar el bloque `if (conversation.categoria)`:

```ts
  // El ruteo pasa a ser por el Caso activo: `Conversation.categoria` queda como
  // denormalización, no como estado de ruteo.
  const casoActivo = await resolverCasoActivo(params.sessionId);
  if (casoActivo?.categoria) {
    if (!(await esCategoriaHabilitada(casoActivo.categoria))) {
      logger.warn("persisted category no longer enabled", { categoria: casoActivo.categoria });
      return textOnlyResponse(DEGRADED_CATEGORY_MESSAGE);
    }
    return callCategoryAgent({
      sessionId: params.sessionId,
      categoria: casoActivo.categoria,
      message: params.message,
      pedidoContactoHecho: casoActivo.estado === "CAPTADO",
    });
  }
```

Y en el fast-path, agregar `pedidoContactoHecho: asignada.casoEstado === "CAPTADO",`.

- [ ] **Step 9: Corregir el doc-comment de `pedido-contacto.ts`**

El módulo **no se borra**: sigue vivo en `frontend/src/lib/escenarios/expectativas.ts:65`. Sacar del doc-comment la frase que lo atribuye al BFF y dejar que su uso son las expectativas del runner de escenarios.

- [ ] **Step 10: Correr los tests**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/chat-orchestrator.test.ts src/lib/pedido-contacto.test.ts && pnpm lint
```

Esperado: PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(bff): ruteo por caso activo y escalamiento agente->receptor"
```

---

### Task 8: Board — detalle con N casos

**Files:**
- Modify: `frontend/src/lib/revision/sesiones.ts:110-146`
- Modify: `frontend/src/lib/board/conversaciones.ts` (tipo `DetalleConversacion` y `obtenerConversacion`)
- Modify: `frontend/src/app/api/revision/sesiones/[id]/route.ts`
- Modify: `frontend/src/components/board/Chats/DetalleChat.tsx:195-246`
- Modify: `frontend/src/components/board/Chats/chats.module.css`
- Modify: `frontend/src/lib/board/captados.ts`
- Test: los `.test.ts`/`.test.tsx` homónimos

**Interfaces:**
- Consumes: schema de Task 1.
- Produces: `getCasosDeSesion(conversationId: string): Promise<CasoSnapshot[]>` (reemplaza `getCasoDeSesion`); `CasoSnapshot` gana `id: string` y `esActivo: boolean`; `DetalleConversacion.casos: CasoSnapshot[]` (reemplaza `caso: CasoSnapshot | null`).

- [ ] **Step 1: Escribir los tests que fallan**

En `frontend/src/lib/revision/sesiones.test.ts`, el mock hoisted se llama `db` (no `prisma`) y hoy solo tiene `caso: { findUnique }`. Ampliarlo:

```ts
const db = vi.hoisted(() => ({
  conversation: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  caso: { findUnique: vi.fn(), findMany: vi.fn() },
}));
```

Cambiar el import de `getCasoDeSesion` a `getCasosDeSesion` y reemplazar su describe:

```ts
describe("getCasosDeSesion", () => {
  beforeEach(() => vi.resetAllMocks());

  function fila(id: string, categoria: string) {
    return {
      id,
      categoria,
      subcategorias: [],
      resumen: null,
      estado: "CAPTADO",
      contactoNombre: "Ana",
      contactoTelefono: null,
      contactoEmail: null,
      correccionAplicada: false,
      eventos: [],
    };
  }

  it("devuelve los casos de la conversación marcando el activo", async () => {
    db.conversation.findUnique.mockResolvedValue({ casoActivoId: "k2" });
    db.caso.findMany.mockResolvedValue([fila("k1", "familia"), fila("k2", "transito")]);

    const casos = await getCasosDeSesion("c1");

    expect(casos).toHaveLength(2);
    expect(casos.find((caso) => caso.id === "k2")?.esActivo).toBe(true);
    expect(casos.find((caso) => caso.id === "k1")?.esActivo).toBe(false);
  });

  it("devuelve lista vacía cuando no hay casos", async () => {
    db.conversation.findUnique.mockResolvedValue({ casoActivoId: null });
    db.caso.findMany.mockResolvedValue([]);
    await expect(getCasosDeSesion("c1")).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/revision/sesiones.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Implementar `getCasosDeSesion`**

`prisma.caso.findUnique({ where: { conversationId } })` **deja de compilar** apenas se quita el `@unique` — este es el punto de ruptura duro del área. En `frontend/src/lib/revision/sesiones.ts`, reemplazar `CasoSnapshot` y `getCasoDeSesion` por:

```ts
export interface CasoSnapshot {
  id: string;
  esActivo: boolean;
  estado: string;
  categoria: string | null;
  subcategorias: string[];
  resumen: unknown;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  correccionAplicada: boolean;
  eventos: { tipo: string; payload: unknown; createdAt: string }[];
}

/**
 * Snapshot de los Casos de una sesión (el id de la sesión ES el
 * Conversation.id). Devuelve `[]` —no `null`— cuando todavía no hay ninguno:
 * un null obligaría a cada consumidor a un branch extra que no aporta.
 * `orderBy createdAt asc` es load-bearing: fija que el Caso inaugural se
 * renderiza primero y que el orden no baila entre requests (`updatedAt` sí se
 * mueve). Alimenta el reporte del runner de escenarios y la UI de revisión.
 */
export async function getCasosDeSesion(conversationId: string): Promise<CasoSnapshot[]> {
  const [conversation, casos] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversationId }, select: { casoActivoId: true } }),
    prisma.caso.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: { eventos: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  return casos.map((caso) => ({
    id: caso.id,
    esActivo: caso.id === conversation?.casoActivoId,
    estado: caso.estado,
    categoria: caso.categoria,
    subcategorias: caso.subcategorias,
    resumen: caso.resumen,
    contactoNombre: caso.contactoNombre,
    contactoTelefono: caso.contactoTelefono,
    contactoEmail: caso.contactoEmail,
    correccionAplicada: caso.correccionAplicada,
    eventos: caso.eventos.map((evento) => ({
      tipo: evento.tipo,
      payload: evento.payload,
      createdAt: evento.createdAt.toISOString(),
    })),
  }));
}
```

- [ ] **Step 4: Propagar a los cuatro consumidores**

El grep completo de `getCasoDeSesion` da exactamente estos (más los mocks de sus tests): `frontend/src/lib/board/conversaciones.ts:10` (import) y `:179` (llamada), `frontend/src/app/api/revision/sesiones/[id]/route.ts:6` (import) y `:25` (llamada).

En `conversaciones.ts`, la interfaz pasa de `caso: CasoSnapshot | null;` a `casos: CasoSnapshot[];`, el import a `getCasosDeSesion`, y dentro del `Promise.all` de `obtenerConversacion`:

```ts
  const [timeline, busquedas, casos, notas] = await Promise.all([
    construirTimeline(conversacion.threadId, { conSpans: true }),
    construirBusquedas(conversacion.threadId),
    getCasosDeSesion(conversacion.id),
    listarNotasDeSesion(conversacion.id),
  ]);
```

y el objeto devuelto cambia `caso,` por `casos,`. Mismo cambio en el route de revisión.

- [ ] **Step 5: Renderizar N casos en `DetalleChat.tsx`**

El bloque que hoy renderiza el panel `Caso` (líneas 195-246) pasa a mapear `detalle.casos`. Un solo caso tiene que verse igual que hoy: el encabezado por caso solo aparece cuando hay más de uno, para no meter ruido visual en el caso más común.

```tsx
{detalle.casos.length === 0 ? (
  <p className={styles.vacio}>Todavía no se registró ningún caso en esta conversación.</p>
) : (
  detalle.casos.map((caso) => (
    <section key={caso.id} className={styles.caso}>
      {detalle.casos.length > 1 ? (
        <h3 className={styles.casoTitulo}>
          {caso.categoria ?? "Fuera de cobertura"}
          {caso.esActivo ? <span className={styles.casoActivo}> · en curso</span> : null}
        </h3>
      ) : null}
      {/* el contenido existente del panel, leyendo `caso` en vez de `detalle.caso` */}
    </section>
  ))
)}
```

Agregar `.caso`, `.casoTitulo` y `.casoActivo` a `chats.module.css` siguiendo los tokens ya usados en el archivo.

- [ ] **Step 6: Verificar `captados.ts`**

`listarCaptados` ya parte de `Caso`, así que el cambio de cardinalidad no lo rompe. Confirmar que ningún `select`/`include` navegue la relación como singular:

```bash
cd /home/bryan/LegalSeller/frontend && grep -n "caso:" src/lib/board/captados.ts src/lib/board/metricas-funnel.ts
```

Cualquier `conversation: { select: { caso: ... } }` que aparezca pasa a `casos`.

- [ ] **Step 7: Correr los tests**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm prisma:generate && pnpm test:unit run src/lib/board src/lib/revision src/components/board && pnpm lint
```

Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(board): el detalle del chat muestra los N casos de la conversación"
```

---

### Task 9: Board — listado por última actividad

**Files:**
- Modify: `frontend/src/lib/board/conversaciones.ts` (`listarConversaciones`, `ChatResumen`)
- Modify: `frontend/src/components/board/Chats/ListadoChats.tsx`
- Test: `frontend/src/lib/board/conversaciones.test.ts`

**Interfaces:**
- Consumes: Task 8.
- Produces: `ChatResumen` gana `ultimaActividad: string` (ISO) y `casos: number`.

- [ ] **Step 1: Escribir el test que falla**

`conversaciones.test.ts` ya tiene un helper `filaConversacion(id)` y mockea `prismaMock.prisma`. Ampliar el helper para aceptar la fecha y la relación en plural, y agregar el test dentro del `describe("listarConversaciones")`:

```ts
it("ordena por última actividad, no por creación", async () => {
  prismaMock.prisma.conversation.findMany.mockResolvedValue([
    { ...filaConversacion("nueva-inactiva"), createdAt: new Date("2026-08-04T10:00:00.000Z") },
    { ...filaConversacion("vieja-activa"), createdAt: new Date("2026-08-01T10:00:00.000Z") },
  ]);
  prismaMock.prisma.$queryRaw.mockResolvedValue([
    {
      threadId: "chat-nueva-inactiva",
      mensajes: 2,
      preview: "hola",
      ultimaActividad: new Date("2026-08-04T10:05:00.000Z"),
    },
    {
      threadId: "chat-vieja-activa",
      mensajes: 8,
      preview: "me despidieron",
      ultimaActividad: new Date("2026-08-05T13:08:00.000Z"),
    },
  ]);

  const pagina = await listarConversaciones({ rango: "30d" });

  expect(pagina.chats.map((chat) => chat.id)).toEqual(["vieja-activa", "nueva-inactiva"]);
});

it("marca CAPTADO el chat que tiene al menos un caso captado", async () => {
  prismaMock.prisma.conversation.findMany.mockResolvedValue([
    { ...filaConversacion("c1"), casos: [{ estado: "EN_CONVERSACION" }, { estado: "CAPTADO" }] },
  ]);
  const pagina = await listarConversaciones({ rango: "30d" });
  expect(pagina.chats[0]).toMatchObject({ estadoCaso: "CAPTADO", casos: 2 });
});
```

El helper `filaConversacion` pasa de `caso: { estado: "CAPTADO" }` a `casos: [{ estado: "CAPTADO" }]`.

- [ ] **Step 2: Correr para verificar que falla**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm exec vitest run src/lib/board/conversaciones.test.ts
```

- [ ] **Step 3: Implementar**

`Conversation.updatedAt` **no sirve**: el `upsert({ update: {} })` de cada turno no la mueve (verificado en producción, quedó cuatro días atrás con mensajes nuevos). La última actividad sale de los mensajes:

```sql
SELECT m.thread_id AS "threadId",
       COUNT(*)::float8 AS mensajes,
       MAX(m."createdAt") AS "ultimaActividad",
       COALESCE(
         (ARRAY_AGG(m.content::text ORDER BY m."createdAt" ASC)
          FILTER (WHERE m.role = 'user'))[1],
         ''
       ) AS preview
FROM mastra.mastra_messages m
WHERE m.thread_id IN (...)
GROUP BY m.thread_id
```

El `COUNT(*)` va casteado a `::float8` (ya lo está) porque `BigInt` rompe `JSON.stringify`; `MAX(m."createdAt")` es un timestamp y no necesita casteo.

El orden se resuelve en JS sobre la página ya traída, ordenando por `ultimaActividad ?? createdAt` descendente. **Documentar la limitación en el código**: la paginación por cursor sigue siendo por `createdAt`, así que el reordenamiento es intra-página. Ordenar globalmente por actividad requiere materializar la columna, y eso es un spec aparte.

La relación pasa a plural, así que hay tres ajustes más en el mismo archivo:

- El `select` de `findMany` cambia `caso: { select: { estado: true } }` por `casos: { select: { estado: true } }`.
- El filtro por estado del `where` pasa de `{ caso: { estado: filtros.estado } }` a `{ casos: { some: { estado: filtros.estado } } }` — un chat matchea si **alguno** de sus casos está en ese estado.
- `ChatResumen.estadoCaso` se deriva de los N: `CAPTADO` si alguno lo está, si no el estado del primero, si no `null`. Conserva el significado que le da el equipo legal a la columna ("¿este chat produjo lead?"). Y se suma `casos: fila.casos.length`.

- [ ] **Step 4: Mostrarlo en la UI**

En `ListadoChats.tsx`: la fecha de cada fila pasa a ser la de última actividad, con la de creación como dato secundario cuando difieren de día. Sumar la columna de casos.

- [ ] **Step 5: Correr los tests**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm test:unit run src/lib/board && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(board): el listado de chats ordena por última actividad"
```

---

### Task 10: Eval de `derivar-tema`

**Files:**
- Create: `backend/src/test/agents/laboral/datasets/derivar-tema.json`
- Modify: `backend/src/test/run-evals.ts` (registrar el eval en el array `EVALS`)

**Interfaces:**
- Consumes: Tasks 5 y 6.
- Produces: entrada nueva en `EVALS`, corrible con `pnpm evals derivar-tema`.

- [ ] **Step 1: Escribir el dataset de laboral**

Crear `backend/src/test/agents/laboral/datasets/derivar-tema.json`. Las **dos caras** son obligatorias; la negativa es la que importa, porque un agente que marca de más suma una llamada al receptor por turno:

```json
[
  {
    "mensajes": [
      { "role": "user", "content": "me despidieron sin causa después de 6 años y no me pagaron nada" },
      { "role": "assistant", "content": "Lamento lo que estás pasando. Contame si te entregaron algún recibo de liquidación." },
      { "role": "user", "content": "no me dieron nada. ah, y aparte tuve un choque el mes pasado y el seguro no me quiere pagar" }
    ],
    "esperado": { "derivaTema": true }
  },
  {
    "mensajes": [
      { "role": "user", "content": "tengo un problema con mi jefe, me quiere echar" },
      { "role": "assistant", "content": "Contame un poco más de la situación." },
      { "role": "user", "content": "y aparte me estoy separando de mi esposa y no sabemos qué hacer con la casa" }
    ],
    "esperado": { "derivaTema": true }
  },
  {
    "mensajes": [
      { "role": "user", "content": "me deben horas extras de todo el año pasado" },
      { "role": "assistant", "content": "Para dimensionarlo necesito saber tu salario y desde cuándo trabajás ahí." },
      { "role": "user", "content": "aparte el dueño del apartamento que alquilo me quiere echar sin aviso" }
    ],
    "esperado": { "derivaTema": true }
  },
  {
    "mensajes": [
      { "role": "user", "content": "me despidieron y quiero saber qué me corresponde" },
      { "role": "assistant", "content": "Para eso necesito tu antigüedad y tu último salario." },
      { "role": "user", "content": "y los días de licencia por estudio que nunca me dieron, los puedo reclamar igual?" }
    ],
    "esperado": { "derivaTema": false }
  },
  {
    "mensajes": [
      { "role": "user", "content": "trabajo en el campo y me pagan menos de lo que corresponde" },
      { "role": "assistant", "content": "Contame qué tareas hacés y cuántas horas." },
      { "role": "user", "content": "también quiero saber si me tienen que pagar el aguinaldo aparte" }
    ],
    "esperado": { "derivaTema": false }
  },
  {
    "mensajes": [
      { "role": "user", "content": "me despidieron estando certificado" },
      { "role": "assistant", "content": "Contame desde cuándo estabas certificado." },
      { "role": "user", "content": "y si además me deben el salario vacacional, va todo en el mismo reclamo?" }
    ],
    "esperado": { "derivaTema": false }
  }
]
```

- [ ] **Step 2: Replicar el dataset en las otras cuatro categorías**

Crear el mismo archivo en `familia/`, `transito/`, `arrendamiento-desalojo/` y `relaciones-consumo/` (bajo `backend/src/test/agents/<agentDir>/datasets/`). Los positivos son temas de otras áreas; los negativos salen de las subcategorías habilitadas de cada una — consultarlas en `backend/src/mastra/dominios/registry.ts`, no inventarlas.

- [ ] **Step 3: Agregar el matcher a `run-evals.ts`**

Junto al bloque de interfaces (47-77):

```ts
interface DerivarTemaItem {
  mensajes: MensajeHistoria[];
  esperado: { derivaTema: boolean };
}
```

Y una función calcada del patrón de `evalCaptacion` (273-307):

```ts
async function evalDerivarTema(agent: CategoriaAgent, agentDir: string, label: string): Promise<number> {
  const ruta = join(dirname(fileURLToPath(import.meta.url)), `agents/${agentDir}/datasets/derivar-tema.json`);
  const items = JSON.parse(readFileSync(ruta, "utf8")) as DerivarTemaItem[];
  let passed = 0;
  for (const item of items) {
    const result = await agent.generate(toGenerateMessages(item.mensajes), {
      requestContext: buildEvalRequestContext(),
    });
    const disparo = extractToolCalls(result).some((call) => call.toolName === "derivar-tema");
    if (disparo === item.esperado.derivaTema) passed += 1;
  }
  console.log(`${label}: ${passed}/${items.length} (${Math.round((passed / items.length) * 100)}%)`);
  return passed / items.length;
}
```

- [ ] **Step 4: Registrar las cinco entradas en `EVALS`**

Siguiendo el patrón de las 19 entradas de agente ya existentes, con los nombres `laboral-derivar-tema`, `familia-derivar-tema`, `transito-derivar-tema`, `arrendamiento-derivar-tema` y `consumo-derivar-tema`, para que el filtro por substring del CLI las tome todas de una. Ojo: el `agentDir` no coincide con el nombre del eval en dos casos (`arrendamiento-desalojo` y `relaciones-consumo`).

- [ ] **Step 5: Correr el eval**

```bash
cd /home/bryan/LegalSeller/backend && pnpm evals derivar-tema
```

Esperado: las cinco pasan el `THRESHOLD` de 0.9. Si falla el lado de no-disparo, el prompt de Task 6 está sesgado de más — **ajustar el texto, no el umbral**.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test
git commit -m "test(evals): dataset de disparo y no-disparo de derivar-tema"
```

---

### Task 11: E2E de dos casos en un chat

**Files:**
- Create: `frontend/tests/casos-multiples.spec.ts`
- Modify: `frontend/tests/board.spec.ts` (el heading «Caso» del detalle)

**Interfaces:**
- Consumes: todas las tareas anteriores.
- Produces: cobertura E2E del recorrido completo.

- [ ] **Step 1: Escribir el test**

Crear `frontend/tests/casos-multiples.spec.ts`, siguiendo el patrón de `board.spec.ts` (skip por `AUTH_SECRET`, helper `iniciarSesionBoard`, timeouts generosos porque cada turno es una llamada real al modelo):

```ts
import { expect, test } from "@playwright/test";

import { iniciarSesionBoard } from "./helpers/sesion-board";

const SECRETO = process.env.AUTH_SECRET ?? "";

test.skip(!SECRETO, "AUTH_SECRET no seteada — E2E del board deshabilitado");

test("dos temas en un chat producen dos casos en el board", async ({ page }) => {
  test.setTimeout(240_000);

  // 1) Chat público: un despido y después, en el MISMO chat, un desalojo.
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Escribí tu consulta" });
  const enviar = page.getByRole("button", { name: "Enviar la consulta" });

  await composer.fill("me despidieron sin causa después de 6 años y no me pagaron la liquidación");
  await composer.press("Enter");
  // El botón se rehabilita recién cuando el stream cerró; esperar por eso, y no
  // por el texto, evita depender de lo que conteste el agente.
  await expect(enviar).toBeEnabled({ timeout: 90_000 });

  await composer.fill("aparte el dueño del apartamento que alquilo me quiere echar sin aviso");
  await composer.press("Enter");
  await expect(enviar).toBeEnabled({ timeout: 90_000 });

  // El cambio de caso activo se aplica al turno SIGUIENTE al que marcó
  // derivar-tema: este tercer mensaje es el que lo ejercita.
  await composer.fill("qué puedo hacer con el desalojo?");
  await composer.press("Enter");
  await expect(enviar).toBeEnabled({ timeout: 90_000 });

  // 2) Board: el chat más reciente tiene dos casos.
  await iniciarSesionBoard(page);
  await page.goto("/board/chats");
  const filas = page.locator("tbody tr");
  await expect(filas.first()).toBeVisible({ timeout: 30_000 });

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/chats\/.+/);

  await expect(page.getByRole("heading", { name: "laboral" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "arrendamiento-desalojo" })).toBeVisible();
  await expect(page.getByText("· en curso")).toBeVisible();
});
```

Si el encabezado por caso de Task 8 Step 5 termina renderizando otro texto, ajustar los dos `getByRole("heading")` a lo que se renderiza — **no** relajarlos a un `getByText` genérico, que pasaría igual con un solo caso y dejaría el test sin valor.

**Prerequisito**: el backend Mastra tiene que estar corriendo en `MASTRA_BASE_URL`; sin él la falla se ve como "No pudimos hablar con el asistente", no como un problema de entorno. Si hiciera falta autenticar por API, usar `page.request` y no el fixture `request`: su cookie jar es otro y la sesión no llega a la página.

- [ ] **Step 2: Correr**

```bash
cd /home/bryan/LegalSeller/frontend && pnpm test tests/casos-multiples.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add frontend/tests
git commit -m "test(e2e): dos temas en un chat producen dos casos en el board"
```

---

## Cierre

- [ ] Suite completa en verde:

```bash
cd /home/bryan/LegalSeller/frontend && pnpm lint && pnpm typecheck && pnpm test:unit run
cd /home/bryan/LegalSeller/backend && pnpm lint && pnpm test && pnpm evals
```

- [ ] Limpieza puntual de las conversaciones de prueba con categoría y subcategorías incoherentes (spec §9), para que el equipo legal no testee contra ellas.
- [ ] Avisar al equipo que el funnel del board subreporta hasta el spec de métricas (spec §7): la razón conversaciones/casos deja de leerse como tasa de conversión.
