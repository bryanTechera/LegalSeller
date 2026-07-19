# Arquitectura de agentes (receptor + clasificación persistida) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec `docs/plans/2026-07-19-arquitectura-agentes-clasificacion.md`: receptor global conversacional con fast-path, clasificación persistida por conversación, agente `laboral` dueño del funnel, captación del caso (lead) en Prisma, proxy SSE observador con encadenamiento same-turn, registry de dominios como fuente única. v1: Laboral/Despido.

**Architecture:** El BFF (Next.js) rutea cada mensaje leyendo `Conversation.categoria` en Prisma: sin categoría → agente `recepcion` (corre con `memory.options.readOnly: true`, no persiste nada); con categoría → agente de categoría (persiste el turno normal). El proxy SSE interpone un observador de tool-calls que persiste clasificación y datos del caso; en el fast-path encadena receptor → agente de categoría en la misma respuesta HTTP. Los agentes se generan con una factory que hornea los gotchas de Mastra v1.

**Tech Stack:** Mastra v1 (`@mastra/core` subpaths), Next.js App Router, Prisma + pgvector, Zod v4, Vitest, pnpm.

## Global Constraints

- NUNCA `any` — `unknown` + Zod; contratos como schema Zod, tipos con `z.infer`.
- NUNCA `console.log` en producción — logger estructurado (`makeLogger` backend, `logger` FE). Excepciones: tests y scripts.
- NUNCA una tool tira excepción en `execute` — degradación graceful `{ status: "error", mensaje }`.
- NUNCA el browser habla directo con el backend Mastra o la DB — todo pasa por el BFF.
- SIEMPRE imports por subpath de Mastra (`@mastra/core/agent`), nunca el barrel.
- Naming: código inglés camelCase (términos del dominio legal pueden quedar en español); IDs Mastra y archivos kebab-case español; prosa user/agent-facing en español; tags XML de prompts en español; comentarios y commits en inglés.
- Gotchas obligatorios en todo agente: `maxSteps` en `defaultOptions` (Mastra v1 lo dropea del constructor), `temperature: 1` explícito (gateway+Gemini), provider order `["google","vertex"]`, null-guard asimétrico en instructions dinámicas.
- Conventional commits; `pnpm lint` + tests antes de cada commit. Trabajo en rama `feature/arquitectura-agentes` (nunca push directo a `main`).
- Ante ambigüedad de dominio legal: NO asumir — registrar la pregunta para el equipo de expertos legales y seguir con lo no ambiguo.

**Preguntas abiertas ya registradas (no bloquean, no resolver por cuenta propia):**
1. Contenido/canales de la respuesta de caso sensible → expertos legales. Mientras tanto se usa un placeholder honesto (ver Task 4) marcado con `TODO(expertos-legales)`.
2. TTL de retención de casos abandonados → negocio (el job de limpieza NO se implementa en v1).
3. **Corpus laboral/despido inexistente** (el corpus actual solo tiene la ley 17.250, de consumo) → pedir documentos de despido a los expertos legales. El agente responde honesto "sin fuentes" hasta que se ingesten.

**Diferido explícitamente (fuera de este plan, registrado):**
- Evals de conversión del stage de venta (spec §9): requieren corpus laboral real para conversar de fondo — se implementan cuando se ingesten los documentos de despido.
- Queries/tablero de métricas (spec §8): los DATOS quedan capturados (`Conversation`, `Caso`, `CasoEvento` con timestamps); las consultas de drop-off/conversión se escriben cuando haya tráfico que medir.
- Job de limpieza TTL de casos abandonados: bloqueado por la definición de negocio (pregunta abierta 2).

**Referencia de mecánica Mastra verificada en vivo — Task 8 (2026-07-19), contra `mastra@1.19.0`/`@mastra/server@1.51.0`/`@mastra/core@1.51.0`:**
- **readOnly confirmado tal cual se asumía:** body de `POST /api/agents/:agentId/stream` con `memory: { thread, resource, options: { readOnly: true } }` (top-level, sin alternativas) — se acepta (200), el agente emite el stream completo igual, y NO persiste mensajes (`GET /api/memory/threads/:id/messages?agentId=...` da `messages: []`). Gotcha: sí crea la fila del thread vacía como side-effect (mismo `GET` sin `?agentId` en el thread devuelve el thread con `title: ""` y sin mensajes) — cualquier limpieza futura de threads abandonados debe barrer también estas filas vacías, no solo `Caso`.
- **Tool-call del observador (fast-path `asignar-clasificacion`):** el evento SSE relevante es `type: "tool-call"` (top-level), con `payload.toolName` y `payload.args` ya parseado como objeto completo en un solo evento — no hace falta acumular deltas. Existen eventos previos por `toolCallId` (`tool-call-input-streaming-start` → `tool-call-delta` con `payload.argsTextDelta` como string → `tool-call-input-streaming-end`) pero el observador del BFF solo necesita reaccionar a `type === "tool-call"`.
- **Append a memoria — el shape asumido NO existe en la versión instalada.** `POST /api/memory/threads/:threadId/messages` es GET-only (list); el endpoint real de append es `POST /api/memory/save-messages?agentId=<id>` con body `{ messages: [{ threadId, resourceId, role, content }] }` (content acepta string plano, se normaliza server-side). El thread NO se crea implícitamente: hay que `POST /api/memory/threads?agentId=<id>` con `{ threadId, resourceId }` antes, o `save-messages` tira 500 `"Thread ... not found"`.
- Detalle completo, samples SSE crudos y comandos exactos: `.superpowers/sdd/task-8-report.md`.

---

### Task 0: Rama de trabajo

**Files:** ninguno.

- [ ] **Step 1: Crear la rama**

```bash
cd /home/bryan/LegalSeller
git checkout -b feature/arquitectura-agentes
```

---

### Task 1: Registry de dominios (backend)

La fuente única de categorías/subcategorías, habilitación y enums Zod.

**Files:**
- Create: `backend/src/mastra/dominios/registry.ts`
- Create: `backend/src/mastra/dominios/laboral/clasificacion.ts`
- Test: `backend/src/mastra/dominios/registry.test.ts`
- Delete: `backend/src/mastra/dominios/.gitkeep`

**Interfaces (Produces):**
```ts
export type CategoriaId = "laboral" | "familia" | "arrendamiento-desalojo" | "relaciones-consumo";
export type ClasificacionEscape = "fuera-de-universo" | "categoria-no-habilitada";
export interface SubcategoriaDef { id: string; nombre: string; descripcion: string; habilitada: boolean; }
export interface CategoriaDef {
  id: CategoriaId; nombre: string; descripcion: string;
  seniales: string[];               // señales de clasificación para el prompt del receptor
  habilitada: boolean; subcategorias: SubcategoriaDef[];
}
export const CATEGORIAS: readonly CategoriaDef[];
export function categoriasHabilitadas(): CategoriaDef[];
export function subcategoriasHabilitadas(categoriaId: CategoriaId): SubcategoriaDef[];
export function subcategoriaUnicaHabilitada(categoriaId: CategoriaId): SubcategoriaDef | null;
export const categoriaAsignableSchema: z.ZodEnum; // ids habilitadas + escapes
export const subcategoriaAsignableSchema: z.ZodEnum; // ids de subcategorías habilitadas (todas las categorías)
```

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/mastra/dominios/registry.test.ts
import { describe, expect, it } from "vitest";

import {
  CATEGORIAS,
  categoriaAsignableSchema,
  categoriasHabilitadas,
  subcategoriaUnicaHabilitada,
  subcategoriasHabilitadas,
} from "./registry.js";

describe("registry de dominios", () => {
  it("tiene las 4 categorías del universo", () => {
    expect(CATEGORIAS.map((c) => c.id)).toEqual([
      "laboral",
      "familia",
      "arrendamiento-desalojo",
      "relaciones-consumo",
    ]);
  });

  it("v1: solo laboral habilitada, solo despido habilitado", () => {
    expect(categoriasHabilitadas().map((c) => c.id)).toEqual(["laboral"]);
    expect(subcategoriasHabilitadas("laboral").map((s) => s.id)).toEqual(["despido"]);
    expect(subcategoriasHabilitadas("familia")).toEqual([]);
  });

  it("detecta el cortocircuito de subcategoría única", () => {
    expect(subcategoriaUnicaHabilitada("laboral")?.id).toBe("despido");
    expect(subcategoriaUnicaHabilitada("familia")).toBeNull();
  });

  it("el enum asignable incluye habilitadas y escapes, nunca deshabilitadas", () => {
    const values = categoriaAsignableSchema.options;
    expect(values).toContain("laboral");
    expect(values).toContain("fuera-de-universo");
    expect(values).toContain("categoria-no-habilitada");
    expect(values).not.toContain("familia");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/dominios/registry.test.ts`
Expected: FAIL — `Cannot find module './registry.js'`

- [ ] **Step 3: Implementar**

```ts
// backend/src/mastra/dominios/laboral/clasificacion.ts
/**
 * Classification data for the laboral domain, consumed by the registry.
 * Taxonomy source of truth: docs/dominio-consultas.md.
 */
export const laboralClasificacion = {
  id: "laboral" as const,
  nombre: "Laboral",
  descripcion:
    "Problemas de trabajo: despidos, sueldos o rubros impagos, licencias, accidentes laborales.",
  seniales: [
    "Menciona un empleador, trabajo, sueldo, despido o telegrama",
    "Habla de liquidación, aguinaldo, salario vacacional, horas extra",
    "Relata un accidente o enfermedad vinculada al trabajo",
  ],
  habilitada: true,
  subcategorias: [
    {
      id: "despido",
      nombre: "Despido",
      descripcion: "Despido directo o indirecto, indemnización, telegrama, notoria mala conducta.",
      habilitada: true,
    },
    { id: "rubros-laborales", nombre: "Rubros laborales", descripcion: "Sueldos, aguinaldo, licencia, horas extra impagas.", habilitada: false },
    { id: "licencias-especiales", nombre: "Licencias especiales", descripcion: "Licencias por estudio, maternidad/paternidad, enfermedad.", habilitada: false },
    { id: "accidentes-laborales", nombre: "Accidentes laborales", descripcion: "Accidentes de trabajo y enfermedades profesionales.", habilitada: false },
  ],
};
```

```ts
// backend/src/mastra/dominios/registry.ts
import { z } from "zod";

import { laboralClasificacion } from "./laboral/clasificacion.js";

/**
 * Single source of truth for the domain taxonomy wiring (spec
 * docs/plans/2026-07-19-arquitectura-agentes-clasificacion.md §5).
 * Enabling a subcategory = its folder + an entry here. Disabled categories
 * keep their data inline until they gain an agent folder.
 */
export type CategoriaId = "laboral" | "familia" | "arrendamiento-desalojo" | "relaciones-consumo";
export type ClasificacionEscape = "fuera-de-universo" | "categoria-no-habilitada";

export interface SubcategoriaDef {
  id: string;
  nombre: string;
  descripcion: string;
  habilitada: boolean;
}

export interface CategoriaDef {
  id: CategoriaId;
  nombre: string;
  descripcion: string;
  seniales: string[];
  habilitada: boolean;
  subcategorias: SubcategoriaDef[];
}

export const CLASIFICACION_ESCAPES = ["fuera-de-universo", "categoria-no-habilitada"] as const;

export const CATEGORIAS: readonly CategoriaDef[] = [
  laboralClasificacion,
  {
    id: "familia",
    nombre: "Familia",
    descripcion: "Pensión alimenticia, tenencia y visitas, divorcio, sucesiones, unión concubinaria, violencia de género.",
    seniales: ["Menciona hijos, pareja, ex pareja, herencia o divorcio"],
    habilitada: false,
    subcategorias: [
      { id: "pension-tenencia-visitas", nombre: "Pensión alimenticia, tenencia y visitas", descripcion: "", habilitada: false },
      { id: "divorcio-sociedad-conyugal", nombre: "Divorcio, sociedad conyugal", descripcion: "", habilitada: false },
      { id: "sucesiones", nombre: "Sucesiones", descripcion: "", habilitada: false },
      { id: "union-concubinaria", nombre: "Unión concubinaria", descripcion: "", habilitada: false },
      { id: "violencia-de-genero", nombre: "Violencia de género", descripcion: "", habilitada: false },
    ],
  },
  {
    id: "arrendamiento-desalojo",
    nombre: "Arrendamiento y desalojo",
    descripcion: "Contratos de alquiler, desalojos (leyes 8153, 14219, 19980), cobro de alquileres.",
    seniales: ["Menciona alquiler, inquilino, propietario, desalojo o garantía"],
    habilitada: false,
    subcategorias: [
      { id: "contrato-de-alquiler", nombre: "Contrato de alquiler", descripcion: "", habilitada: false },
      { id: "desalojo-ley-8153", nombre: "Desalojo ley 8153", descripcion: "", habilitada: false },
      { id: "desalojo-ley-14219", nombre: "Desalojo ley 14219", descripcion: "", habilitada: false },
      { id: "desalojo-ley-19980", nombre: "Desalojo ley 19980", descripcion: "", habilitada: false },
      { id: "cobro-alquileres", nombre: "Cobro alquileres", descripcion: "", habilitada: false },
    ],
  },
  {
    id: "relaciones-consumo",
    nombre: "Relaciones de consumo",
    descripcion: "Derechos del consumidor, reclamos ante el MEF y el poder judicial.",
    seniales: ["Menciona una compra, un servicio contratado, una garantía o un reclamo a una empresa"],
    habilitada: false,
    subcategorias: [
      { id: "derechos-del-consumidor", nombre: "Derechos del consumidor", descripcion: "", habilitada: false },
      { id: "procedimiento-mef-judicial", nombre: "Procedimiento ante MEF y poder judicial", descripcion: "", habilitada: false },
    ],
  },
];

export function categoriasHabilitadas(): CategoriaDef[] {
  return CATEGORIAS.filter((c) => c.habilitada);
}

export function subcategoriasHabilitadas(categoriaId: CategoriaId): SubcategoriaDef[] {
  const categoria = CATEGORIAS.find((c) => c.id === categoriaId);
  if (!categoria?.habilitada) return [];
  return categoria.subcategorias.filter((s) => s.habilitada);
}

export function subcategoriaUnicaHabilitada(categoriaId: CategoriaId): SubcategoriaDef | null {
  const habilitadas = subcategoriasHabilitadas(categoriaId);
  return habilitadas.length === 1 ? habilitadas[0] : null;
}

function nonEmptyEnum(values: string[], label: string): [string, ...string[]] {
  if (values.length === 0) throw new Error(`Registry produced an empty enum for ${label}`);
  return values as [string, ...string[]];
}

/** Values the receptor may assign: enabled categories + escapes. */
export const categoriaAsignableSchema = z.enum(
  nonEmptyEnum([...categoriasHabilitadas().map((c) => c.id), ...CLASIFICACION_ESCAPES], "categorias"),
);

/** All enabled subcategory ids across categories (for the optional fast-path field). */
export const subcategoriaAsignableSchema = z.enum(
  nonEmptyEnum(
    categoriasHabilitadas().flatMap((c) => subcategoriasHabilitadas(c.id).map((s) => s.id)),
    "subcategorias",
  ),
);
```

```bash
rm backend/src/mastra/dominios/.gitkeep
```

- [ ] **Step 4: Verificar que pasa + gates**

Run: `cd backend && pnpm vitest run src/mastra/dominios/registry.test.ts && pnpm lint`
Expected: PASS, lint limpio.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mastra/dominios
git commit -m "feat(backend): domain registry with taxonomy, enablement flags and Zod enums"
```

---

### Task 2: Factory de agentes `crearAgente` (hornea los gotchas)

**Files:**
- Create: `backend/src/mastra/common/crear-agente.ts`
- Test: `backend/src/mastra/common/crear-agente.test.ts`

**Interfaces:**
- Consumes: `ReadOnlyState` de `models/index.js`, `getReadOnlyFromContext` de `common/middleware`.
- Produces:
```ts
export interface CrearAgenteParams {
  id: string;                    // kebab-case español; también es el path del endpoint
  name: string;
  description: string;
  buildInstructions: (readOnly: ReadOnlyState | null) => string;
  buildTools: (readOnly: ReadOnlyState | null) => Record<string, unknown>;
  memory?: Memory;
  model?: string;                // default "google/gemini-3-flash"
  maxSteps?: number;             // default 10
  maxRetries?: number;           // default 3
}
export function crearAgente(params: CrearAgenteParams): Agent;
```

- [ ] **Step 1: Escribir el test que falla**

```ts
// backend/src/mastra/common/crear-agente.test.ts
import { describe, expect, it } from "vitest";

import { crearAgente } from "./crear-agente.js";

const params = {
  id: "prueba",
  name: "pruebaAgent",
  description: "Agente de prueba",
  buildInstructions: (readOnly: { userId: string } | null) =>
    readOnly ? `<rol>hola ${readOnly.userId}</rol>` : "<rol>hola</rol>",
  buildTools: () => ({}),
};

describe("crearAgente", () => {
  it("crea un Agent con el id dado", () => {
    const agent = crearAgente(params);
    expect(agent.id).toBe("prueba");
  });

  it("null-guard asimétrico: sin requestContext devuelve instrucciones vacías en vez de tirar", async () => {
    const roto = crearAgente({
      ...params,
      buildInstructions: () => {
        throw new Error("boom");
      },
    });
    // Startup/listing path: no request context — must not throw.
    const instructions = await roto.getInstructions({ requestContext: undefined });
    expect(instructions).toBe("");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/common/crear-agente.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// backend/src/mastra/common/crear-agente.ts
import { gateway } from "@ai-sdk/gateway";
import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { Memory } from "@mastra/memory";

import type { ReadOnlyState } from "../../models/index.js";
import { getReadOnlyFromContext } from "./middleware/index.js";

export interface CrearAgenteParams {
  id: string;
  name: string;
  description: string;
  buildInstructions: (readOnly: ReadOnlyState | null) => string;
  buildTools: (readOnly: ReadOnlyState | null) => Record<string, unknown>;
  memory?: Memory;
  model?: string;
  maxSteps?: number;
  maxRetries?: number;
}

/**
 * Agent factory that bakes the Mastra v1 production gotchas exactly once
 * (guia-codificacion-backend §3): maxSteps must live in defaultOptions,
 * temperature must be explicit with gateway+Gemini, provider order pinned for
 * implicit caching, and dynamic instructions get the asymmetric null-guard
 * (startup/listing has no request context — swallow; a real request must
 * never run the agent with a silently broken prompt).
 */
export function crearAgente(params: CrearAgenteParams): Agent {
  const {
    id,
    name,
    description,
    buildInstructions,
    buildTools,
    memory,
    model = "google/gemini-3-flash",
    maxSteps = 10,
    maxRetries = 3,
  } = params;

  function dynamicInstructions({ requestContext }: { requestContext?: RequestContext }): string {
    const readOnly = getReadOnlyFromContext(requestContext);
    try {
      return buildInstructions(readOnly);
    } catch (error) {
      if (readOnly === null) return "";
      throw error;
    }
  }

  function dynamicTools({ requestContext }: { requestContext?: RequestContext }) {
    return buildTools(getReadOnlyFromContext(requestContext));
  }

  function dynamicOptions() {
    return {
      maxSteps,
      modelSettings: { temperature: 1 },
      providerOptions: { gateway: { order: ["google", "vertex"] } },
    };
  }

  return new Agent({
    id,
    name,
    description,
    instructions: dynamicInstructions,
    tools: dynamicTools,
    ...(memory ? { memory } : {}),
    model: gateway(model),
    maxRetries,
    defaultOptions: dynamicOptions,
  });
}
```

Nota: si `agent.getInstructions` no existe con esa firma en `@mastra/core` instalado, ajustar el test para invocar `dynamicInstructions` exportándola como named export `buildDynamicInstructions(params)` y testear esa función pura. El contrato de la factory no cambia.

- [ ] **Step 4: Verificar que pasa + gates**

Run: `cd backend && pnpm vitest run src/mastra/common/crear-agente.test.ts && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mastra/common/crear-agente.ts backend/src/mastra/common/crear-agente.test.ts
git commit -m "feat(backend): agent factory baking Mastra v1 gotchas"
```

---

### Task 3: Tools de señal — `asignar-clasificacion`, `registrar-caso`, `corregir-clasificacion`

Las tres son **tools de señal**: validan con Zod y devuelven `{ status, mensaje }`; la persistencia la hace el BFF al observar el tool-call en el stream (spec §7). Nunca tocan la DB.

**Files:**
- Create: `backend/src/mastra/tools/clasificacion/asignar-clasificacion-tool.ts`
- Create: `backend/src/mastra/tools/clasificacion/corregir-clasificacion-tool.ts`
- Create: `backend/src/mastra/tools/casos/registrar-caso-tool.ts`
- Test: `backend/src/mastra/tools/clasificacion/asignar-clasificacion-tool.test.ts`
- Test: `backend/src/mastra/tools/casos/registrar-caso-tool.test.ts`

**Interfaces:**
- Consumes: `categoriaAsignableSchema`, `subcategoriaAsignableSchema`, `categoriasHabilitadas` del registry (Task 1).
- Produces (los shapes que el BFF parsea en Task 11/13 — mantener sincronizados):
```ts
// asignar-clasificacion input
{ categoria: "laboral" | "fuera-de-universo" | "categoria-no-habilitada",
  subcategoria?: string, confianza: "baja" | "media" | "alta",
  casoSensible: boolean, brief: string, temaDetectado?: string }
// registrar-caso input (todo opcional menos un campo presente)
{ subcategorias?: string[], hechos?: string, interesAdicional?: string,
  contactoNombre?: string, contactoTelefono?: string, contactoEmail?: string }
// corregir-clasificacion input
{ categoria: <ids habilitadas>, motivo: string }
```

- [ ] **Step 1: Tests que fallan**

```ts
// backend/src/mastra/tools/clasificacion/asignar-clasificacion-tool.test.ts
import { describe, expect, it } from "vitest";

import { asignarClasificacionTool } from "./asignar-clasificacion-tool.js";

describe("asignar-clasificacion", () => {
  it("id estable (contrato con el BFF)", () => {
    expect(asignarClasificacionTool.id).toBe("asignar-clasificacion");
  });

  it("acepta una asignación fast-path completa", async () => {
    const result = await asignarClasificacionTool.execute(
      {
        categoria: "laboral",
        subcategoria: "despido",
        confianza: "alta",
        casoSensible: false,
        brief: "Despedido ayer sin pago de liquidación, 3 años de antigüedad.",
      },
      {} as never,
    );
    expect(result.status).toBe("ok");
  });

  it("rechaza una categoría deshabilitada por schema", () => {
    const parsed = asignarClasificacionTool.inputSchema.safeParse({
      categoria: "familia",
      confianza: "alta",
      casoSensible: false,
      brief: "x",
    });
    expect(parsed.success).toBe(false);
  });
});
```

```ts
// backend/src/mastra/tools/casos/registrar-caso-tool.test.ts
import { describe, expect, it } from "vitest";

import { registrarCasoTool } from "./registrar-caso-tool.js";

describe("registrar-caso", () => {
  it("id estable (contrato con el BFF)", () => {
    expect(registrarCasoTool.id).toBe("registrar-caso");
  });

  it("acepta captura incremental (solo hechos, sin contacto)", async () => {
    const result = await registrarCasoTool.execute(
      { hechos: "Trabajó 3 años en una panadería; telegrama de despido el 15/07." },
      {} as never,
    );
    expect(result.status).toBe("ok");
  });

  it("rechaza un registro vacío", () => {
    expect(registrarCasoTool.inputSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `cd backend && pnpm vitest run src/mastra/tools`
Expected: FAIL — módulos inexistentes (el test existente de `buscar-documentos`, si lo hay, sigue pasando).

- [ ] **Step 3: Implementar**

```ts
// backend/src/mastra/tools/clasificacion/asignar-clasificacion-tool.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { categoriaAsignableSchema, subcategoriaAsignableSchema } from "../../dominios/registry.js";

/**
 * Signal tool: the classification act is a typed tool-call. The BFF observes
 * it in the SSE stream and persists it (spec §7) — execute never touches the DB.
 */
export const asignarClasificacionTool = createTool({
  id: "asignar-clasificacion",
  description: `Asigná la clasificación de la consulta del usuario. Llamala EN CUANTO tengas confianza suficiente, idealmente desde el primer mensaje si ya alcanza.

CUANDO USAR:
- La consulta encaja con claridad en una categoría habilitada (con o sin subcategoría).
- La consulta pertenece al universo legal pero a una categoría aún no cubierta: usá "categoria-no-habilitada" e indicá temaDetectado.
- La consulta no es un tema legal que atendamos: usá "fuera-de-universo".`,
  inputSchema: z.object({
    categoria: categoriaAsignableSchema.meta({ description: "Categoría asignada o escape" }),
    subcategoria: subcategoriaAsignableSchema
      .optional()
      .meta({ description: "Subcategoría, solo si el relato ya la determina con claridad (fast-path)" }),
    confianza: z.enum(["baja", "media", "alta"]).meta({ description: "Confianza en la clasificación" }),
    casoSensible: z
      .boolean()
      .meta({ description: "true si hay riesgo personal (violencia, urgencia) que exige cortocircuito" }),
    brief: z
      .string()
      .min(1)
      .meta({ description: "Resumen fáctico de lo relatado por el usuario (hechos, fechas), para no re-preguntar" }),
    temaDetectado: z
      .string()
      .optional()
      .meta({ description: "Tema identificado cuando la categoría es un escape (señal de demanda)" }),
  }),
  outputSchema: z.object({ status: z.enum(["ok"]), mensaje: z.string() }),
  execute: async () => ({
    status: "ok" as const,
    mensaje: "Clasificación registrada. No anuncies este paso al usuario; continuá la conversación con naturalidad.",
  }),
});
```

```ts
// backend/src/mastra/tools/casos/registrar-caso-tool.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { subcategoriaAsignableSchema } from "../../dominios/registry.js";

/**
 * Signal tool for incremental lead capture (spec §4/§6): persist-on-observe by
 * the BFF. Call it as soon as data appears — never wait for the conversation
 * to end.
 */
export const registrarCasoTool = createTool({
  id: "registrar-caso",
  description: `Registrá datos del caso APENAS aparezcan en la conversación: hechos relevantes, subcategorías detectadas, intereses adicionales y datos de contacto. Llamala cada vez que el usuario aporte información nueva relevante; los datos se acumulan.`,
  inputSchema: z
    .object({
      subcategorias: z.array(subcategoriaAsignableSchema).optional().meta({ description: "Subcategorías detectadas (acumulativas)" }),
      hechos: z.string().optional().meta({ description: "Hechos/fechas nuevos relatados por el usuario" }),
      interesAdicional: z.string().optional().meta({ description: "Tema extra fuera de la categoría de la conversación" }),
      contactoNombre: z.string().optional(),
      contactoTelefono: z.string().optional(),
      contactoEmail: z.string().optional(),
    })
    .refine((value) => Object.values(value).some((v) => v !== undefined), {
      message: "Registrá al menos un dato",
    }),
  outputSchema: z.object({ status: z.enum(["ok"]), mensaje: z.string() }),
  execute: async () => ({
    status: "ok" as const,
    mensaje: "Datos del caso registrados. No repitas al usuario lo que registraste; seguí la conversación.",
  }),
});
```

```ts
// backend/src/mastra/tools/clasificacion/corregir-clasificacion-tool.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { categoriasHabilitadas } from "../../dominios/registry.js";

const categoriaHabilitadaSchema = z.enum(
  categoriasHabilitadas().map((c) => c.id) as [string, ...string[]],
);

/**
 * Signal tool: bounded reclassification (max one per conversation — the BFF
 * enforces the limit and records the audit trail, spec §6).
 */
export const corregirClasificacionTool = createTool({
  id: "corregir-clasificacion",
  description: `Corregí la categoría de la conversación SOLO si es evidente que la clasificación inicial fue un error (el problema real del usuario es de otra área). Disponible una única vez por conversación. Un tema ADICIONAL no es un error: registralo con registrar-caso (interesAdicional).`,
  inputSchema: z.object({
    categoria: categoriaHabilitadaSchema.meta({ description: "Categoría correcta" }),
    motivo: z.string().min(1).meta({ description: "Por qué la clasificación anterior fue un error" }),
  }),
  outputSchema: z.object({ status: z.enum(["ok"]), mensaje: z.string() }),
  execute: async () => ({
    status: "ok" as const,
    mensaje: "Corrección registrada.",
  }),
});
```

- [ ] **Step 4: Verificar que pasan + gates**

Run: `cd backend && pnpm vitest run src/mastra/tools && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mastra/tools
git commit -m "feat(backend): signal tools for classification and incremental case capture"
```

---

### Task 4: Stages compartidos de prompt (persona + venta) y receptor global

**Files:**
- Create: `backend/src/mastra/common/prompt-stages.ts`
- Create: `backend/src/mastra/dominios/recepcion/instructions.ts`
- Create: `backend/src/mastra/dominios/recepcion/index.ts`
- Test: `backend/src/mastra/dominios/recepcion/instructions.test.ts`

**Interfaces:**
- Consumes: `crearAgente` (Task 2), tools (Task 3), registry (Task 1), `subagentMemory` de `common/memory`.
- Produces:
```ts
// prompt-stages.ts
export const PERSONA_STAGE: string;   // voz/tono compartidos — el cambio de agente es invisible
export const VENTA_STAGE: string;     // skill de venta/captación compartida
// recepcion/index.ts
export const recepcionAgent: Agent;   // id "recepcion"
```

- [ ] **Step 1: Test que falla** (el prompt es un contrato: se testean sus invariantes, no la prosa)

```ts
// backend/src/mastra/dominios/recepcion/instructions.test.ts
import { describe, expect, it } from "vitest";

import { buildRecepcionInstructions } from "./instructions.js";

describe("instrucciones del receptor global", () => {
  const prompt = buildRecepcionInstructions(null);

  it("solo ofrece las categorías habilitadas y los escapes", () => {
    expect(prompt).toContain("laboral");
    expect(prompt).toContain("fuera-de-universo");
    expect(prompt).toContain("categoria-no-habilitada");
    expect(prompt).not.toContain("familia:"); // disabled categories are not offered as options
  });

  it("fija el presupuesto de preguntas y el fast-path", () => {
    expect(prompt).toMatch(/máximo 2 preguntas/i);
    expect(prompt).toMatch(/sin escribir texto/i);
  });

  it("antepone el chequeo de caso sensible al triage", () => {
    const sensibleIdx = prompt.indexOf("<caso_sensible>");
    const triageIdx = prompt.indexOf("<mision>");
    expect(sensibleIdx).toBeGreaterThan(-1);
    expect(sensibleIdx).toBeLessThan(triageIdx);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/dominios/recepcion`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// backend/src/mastra/common/prompt-stages.ts
/**
 * Shared prompt stages composed by every FE-facing agent (spec §4). Stable
 * content — goes FIRST in every prompt (cache-friendly ordering).
 * User/agent-facing prose in Spanish; XML tags in Spanish.
 */
export const PERSONA_STAGE = `<personalidad>
Sos el asistente legal de LegalSeller. Hablás en español rioplatense, de vos, con calidez profesional: escuchás primero, explicás claro y sin tecnicismos innecesarios, y nunca sonás a formulario ni a robot. Sos una sola voz en toda la conversación.
</personalidad>`;

export const VENTA_STAGE = `<captacion>
Tu objetivo de fondo es que el usuario confíe y deje sus datos para que un abogado de nuestra red tome su caso.
- Primero aportá valor: respondé o reconocé el problema antes de pedir nada.
- Registrá con la herramienta registrar-caso cada dato relevante APENAS aparezca (hechos, fechas, subcategorías, intereses adicionales). Nunca preguntes algo cuya respuesta no vayas a registrar.
- Pedí los datos de contacto (nombre y teléfono o email) en el momento en que ya demostraste que entendés el caso — típicamente después de resolver la primera duda de fondo. Hacelo una sola vez con naturalidad; si el usuario no quiere, seguí ayudando igual.
- NUNCA vuelvas a preguntar algo que el usuario ya contó en la conversación.
- NUNCA condiciones una respuesta a que deje sus datos.
- "Eso lo va a evaluar el abogado que tome tu caso" es una respuesta válida cuando la consulta excede lo informativo.
</captacion>`;
```

```ts
// backend/src/mastra/dominios/recepcion/instructions.ts
import type { ReadOnlyState } from "../../../models/index.js";
import { PERSONA_STAGE } from "../../common/prompt-stages.js";
import { categoriasHabilitadas, CATEGORIAS } from "../registry.js";

/**
 * Global receptor: single conversational classifier (spec §3). Its whole job
 * is to obtain the classification; it never answers substantive questions.
 */
export function buildRecepcionInstructions(readOnly: ReadOnlyState | null): string {
  const habilitadas = categoriasHabilitadas()
    .map((c) => `- ${c.id}: ${c.descripcion} Señales: ${c.seniales.join("; ")}`)
    .join("\n");
  const noHabilitadas = CATEGORIAS.filter((c) => !c.habilitada)
    .map((c) => `- ${c.nombre}: ${c.descripcion}`)
    .join("\n");

  const stable = `${PERSONA_STAGE}

<caso_sensible>
ANTES de cualquier otra cosa: si el relato sugiere violencia de género, riesgo personal o una urgencia donde alguien puede estar en peligro, llamá asignar-clasificacion con casoSensible: true y respondé SOLO con contención y canales de ayuda inmediata. Cero preguntas de triage.
TODO(expertos-legales): contenido y canales exactos pendientes de definición — mientras tanto: recomendá llamar al 911 ante peligro inmediato y a la línea gratuita 0800 4141 (violencia basada en género, Uruguay).
</caso_sensible>

<mision>
Tu única misión es clasificar la consulta en una categoría llamando a la herramienta asignar-clasificacion. NO respondés consultas legales de fondo ni buscás en ningún corpus: de eso se encarga el especialista que sigue.
</mision>

<reglas>
- Clasificá desde lo que el usuario YA DIJO antes de preguntar nada. Si el primer mensaje alcanza con confianza alta: llamá asignar-clasificacion de inmediato y SIN escribir texto al usuario (incluí subcategoria si el relato la determina).
- Si necesitás más información: hacé máximo 2 preguntas en total, de a una, y cada pregunta debe ir acompañada de una frase de reconocimiento empático del problema. Nunca un turno que sea solo una pregunta.
- Agotadas las preguntas, asigná tu mejor hipótesis con confianza "baja".
- El campo brief debe resumir TODOS los hechos relatados (qué pasó, cuándo, contexto) para que el especialista no re-pregunte nada.
- Consulta de un tema legal que aún no cubrimos: asigná "categoria-no-habilitada" con temaDetectado, decilo con honestidad y ofrecé dejar contacto con registrar-caso ("un abogado de nuestra red puede evaluarlo").
- Consulta que no es de nuestro universo legal: asigná "fuera-de-universo" y despedite con amabilidad.
- NUNCA anuncies la clasificación ni el funcionamiento interno.
</reglas>

<categorias_habilitadas>
${habilitadas}
</categorias_habilitadas>

<temas_aun_no_cubiertos>
${noHabilitadas}
</temas_aun_no_cubiertos>`;

  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  return `${stable}${userBlock}`;
}
```

```ts
// backend/src/mastra/dominios/recepcion/index.ts
import { subagentMemory } from "../../common/memory/index.js";
import { crearAgente } from "../../common/crear-agente.js";
import { asignarClasificacionTool } from "../../tools/clasificacion/asignar-clasificacion-tool.js";
import { registrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";

import { buildRecepcionInstructions } from "./instructions.js";

/**
 * Global receptor. Runs with memory readOnly (the BFF sends
 * memory.options.readOnly: true): reads thread history but persists nothing —
 * the category agent owns the durable turn (spec §7).
 */
export const recepcionAgent = crearAgente({
  id: "recepcion",
  name: "recepcionAgent",
  description: "Receptor global: conversa lo mínimo para clasificar la consulta en una categoría habilitada.",
  buildInstructions: buildRecepcionInstructions,
  buildTools: () => ({
    [asignarClasificacionTool.id]: asignarClasificacionTool,
    [registrarCasoTool.id]: registrarCasoTool,
  }),
  memory: subagentMemory,
  maxSteps: 5,
});
```

- [ ] **Step 4: Verificar que pasa + gates**

Run: `cd backend && pnpm vitest run src/mastra/dominios/recepcion && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mastra/common/prompt-stages.ts backend/src/mastra/dominios/recepcion
git commit -m "feat(backend): shared prompt stages and global receptor agent"
```

---

### Task 5: Dominio laboral — migrar `consultas` al agente de categoría dueño del funnel

**Files:**
- Create: `backend/src/mastra/dominios/laboral/instructions.ts`
- Create: `backend/src/mastra/dominios/laboral/index.ts`
- Modify: `backend/src/mastra/common/memory/index.ts` (template de working memory con campos del caso)
- Modify: `backend/src/models/index.ts` (`casoBrief` en `ReadOnlyState`; `AgentId`)
- Delete: `backend/src/mastra/agents/main/consultas/` (las 3 piezas quedan absorbidas por la factory + dominio)
- Test: `backend/src/mastra/dominios/laboral/instructions.test.ts`

**Interfaces:**
- Consumes: `crearAgente`, `PERSONA_STAGE`/`VENTA_STAGE`, tools de Task 3, `searchDocumentsTool`, `sharedMemory`.
- Produces:
```ts
export const laboralAgent: Agent;  // id "laboral" — el BFF rutea por Conversation.categoria === agentId
// models/index.ts
export interface ReadOnlyState { userId: string; userName?: string; casoBrief?: string; }
export type AgentId = "recepcion" | "laboral";
```

- [ ] **Step 1: Test que falla**

```ts
// backend/src/mastra/dominios/laboral/instructions.test.ts
import { describe, expect, it } from "vitest";

import { buildLaboralInstructions } from "./instructions.js";

describe("instrucciones del agente laboral", () => {
  it("compone persona y venta, y mantiene las reglas de citas", () => {
    const prompt = buildLaboralInstructions(null);
    expect(prompt).toContain("<personalidad>");
    expect(prompt).toContain("<captacion>");
    expect(prompt).toMatch(/cit[áa]/i);
    expect(prompt).toContain("buscar-documentos");
  });

  it("inyecta el brief del receptor cuando viene en el contexto", () => {
    const prompt = buildLaboralInstructions({ userId: "s1", casoBrief: "Despido sin liquidación." });
    expect(prompt).toContain("Despido sin liquidación.");
  });

  it("nivel 2 colapsado: instruye determinar y registrar la subcategoría", () => {
    const prompt = buildLaboralInstructions(null);
    expect(prompt).toContain("registrar-caso");
    expect(prompt).toContain("despido");
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/dominios/laboral`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// backend/src/mastra/dominios/laboral/instructions.ts
import type { ReadOnlyState } from "../../../models/index.js";
import { PERSONA_STAGE, VENTA_STAGE } from "../../common/prompt-stages.js";
import { subcategoriasHabilitadas } from "../registry.js";

export function buildLaboralInstructions(readOnly: ReadOnlyState | null): string {
  const subcats = subcategoriasHabilitadas("laboral")
    .map((s) => `- ${s.id}: ${s.descripcion}`)
    .join("\n");

  const stable = `${PERSONA_STAGE}

<rol>
Sos el especialista en derecho laboral de LegalSeller. Conducís la conversación completa: escuchás, evacuás dudas con respaldo del corpus y captás el caso para derivarlo a un abogado de la red.
</rol>

<reglas>
- SIEMPRE buscá en el corpus con buscar-documentos antes de responder una consulta sustantiva, filtrando por tus subcategorías (categoria: "laboral").
- SIEMPRE citá la fuente (título del documento y sección) de cada afirmación basada en el corpus.
- NUNCA inventes contenido legal ni cites documentos que no devolvió la búsqueda.
- Si la búsqueda no encuentra fuentes, decilo con claridad y no respondas con conocimiento general como si fuera del corpus.
- NUNCA des asesoramiento legal personalizado definitivo: la respuesta es informativa y basada en los documentos disponibles.
- Si la consulta encaja en tu área pero en una subcategoría todavía sin corpus, sé honesto y ofrecé la captación igual.
- Si es evidente que la conversación fue mal clasificada (el problema real es de otra área), usá corregir-clasificacion (disponible una sola vez). Un tema adicional NO es un error de clasificación: registralo como interesAdicional.
</reglas>

<subcategorias>
Determiná la(s) subcategoría(s) del caso durante la conversación y registralas con registrar-caso apenas las detectes. Subcategorías habilitadas:
${subcats}
</subcategorias>

${VENTA_STAGE}`;

  const briefBlock = readOnly?.casoBrief
    ? `\n\n<caso_recabado>\nLo que el usuario ya contó (NO re-preguntar nada de esto):\n${readOnly.casoBrief}\n</caso_recabado>`
    : "";
  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  return `${stable}${briefBlock}${userBlock}`;
}
```

```ts
// backend/src/mastra/dominios/laboral/index.ts
import { sharedMemory } from "../../common/memory/index.js";
import { crearAgente } from "../../common/crear-agente.js";
import { corregirClasificacionTool } from "../../tools/clasificacion/corregir-clasificacion-tool.js";
import { registrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { searchDocumentsTool } from "../../tools/documentos/buscar-documentos-tool.js";

import { buildLaboralInstructions } from "./instructions.js";

/** Category agent for Laboral: owns the conversation and the funnel (spec §4). */
export const laboralAgent = crearAgente({
  id: "laboral",
  name: "laboralAgent",
  description: "Agente principal de la categoría Laboral: evacúa dudas con citas del corpus y capta el caso.",
  buildInstructions: buildLaboralInstructions,
  buildTools: () => ({
    [searchDocumentsTool.id]: searchDocumentsTool,
    [registrarCasoTool.id]: registrarCasoTool,
    [corregirClasificacionTool.id]: corregirClasificacionTool,
  }),
  memory: sharedMemory,
});
```

En `backend/src/mastra/common/memory/index.ts` reemplazar el template:

```ts
const WORKING_MEMORY_TEMPLATE = `# Caso del usuario

- Hechos y fechas relatados:
- Subcategorías detectadas:
- Intereses adicionales (otros temas mencionados):
- Datos de contacto ya aportados:
- Preferencias de respuesta:
`;
```

En `backend/src/models/index.ts`:

```ts
export interface ReadOnlyState {
  /** Anonymous session id in v1 (also the Mastra resourceId). */
  userId: string;
  userName?: string;
  /** Case brief produced by the receptor's classification (never re-ask its contents). */
  casoBrief?: string;
}

export type AgentId = "recepcion" | "laboral";
```

```bash
rm -r backend/src/mastra/agents
```

- [ ] **Step 4: Verificar + gates** (los tests de `consultas` no existen; el suite entero debe quedar verde)

Run: `cd backend && pnpm vitest run && pnpm lint`
Expected: PASS (nada importa ya `agents/main/consultas` — `mastra/index.ts` se corrige en Task 7; si el build/typecheck intermedio falla por ese import, adelantar solo la línea del import de Task 7).

- [ ] **Step 5: Commit**

```bash
git add -A backend/src
git commit -m "feat(backend): laboral category agent owning the funnel; retire generic consultas agent"
```

---

### Task 6: Partición del corpus — columnas, ingesta y filtro de retrieval

**Files:**
- Modify: `frontend/prisma/schema.prisma` (columnas en `Document`)
- Modify: `backend/src/scripts/ingest.ts` (flags `--categoria`/`--subcategoria`)
- Modify: `backend/src/mastra/tools/documentos/buscar-documentos-tool.ts` (filtro)
- Test: `backend/src/mastra/tools/documentos/buscar-documentos-tool.test.ts` (nuevo, sobre el armado del SQL)

- [ ] **Step 1: Migración Prisma**

En `frontend/prisma/schema.prisma`, agregar a `model Document` (después de `sourceKey`):

```prisma
  /// Corpus partition (registry ids). Null = legacy/untagged document.
  categoria    String?
  subcategoria String?
```

y el índice `@@index([categoria, subcategoria])` junto a los índices existentes.

Run: `cd frontend && pnpm prisma migrate dev --name document-partition`
Expected: migración aplicada sin drift (las tablas de Mastra viven en el schema `mastra`, no aparecen).

- [ ] **Step 2: Test del filtro que falla**

```ts
// backend/src/mastra/tools/documentos/buscar-documentos-tool.test.ts
import { describe, expect, it } from "vitest";

import { buildSearchQuery } from "./buscar-documentos-tool.js";

describe("buildSearchQuery", () => {
  it("sin filtro: no agrega condiciones de partición", () => {
    const { sql, params } = buildSearchQuery({ vector: "[1,2]", minSimilarity: 0.3, limit: 5 });
    expect(sql).not.toContain('"categoria"');
    expect(params).toHaveLength(3);
  });

  it("con categoría y subcategorías: filtra por ambas", () => {
    const { sql, params } = buildSearchQuery({
      vector: "[1,2]",
      minSimilarity: 0.3,
      limit: 5,
      categoria: "laboral",
      subcategorias: ["despido"],
    });
    expect(sql).toContain('d."categoria" = $4');
    expect(sql).toContain('d."subcategoria" = ANY($5)');
    expect(params).toEqual(["[1,2]", 0.3, 5, "laboral", ["despido"]]);
  });
});
```

Run: `cd backend && pnpm vitest run src/mastra/tools/documentos`
Expected: FAIL — `buildSearchQuery` no existe.

- [ ] **Step 3: Implementar el filtro**

En `buscar-documentos-tool.ts`: extraer el armado del SQL a una función exportada y extender el input schema.

```ts
export interface SearchQueryParams {
  vector: string;
  minSimilarity: number;
  limit: number;
  categoria?: string;
  subcategorias?: string[];
}

/** Exported for tests: builds the pgvector search query with optional partition filter. */
export function buildSearchQuery({ vector, minSimilarity, limit, categoria, subcategorias }: SearchQueryParams): {
  sql: string;
  params: unknown[];
} {
  const params: unknown[] = [vector, minSimilarity, limit];
  const conditions: string[] = [`1 - (c."embedding" <=> $1::vector) > $2`];
  if (categoria) {
    params.push(categoria);
    conditions.push(`d."categoria" = $${params.length}`);
  }
  if (subcategorias && subcategorias.length > 0) {
    params.push(subcategorias);
    conditions.push(`d."subcategoria" = ANY($${params.length})`);
  }
  const sql = `SELECT c."documentId"  AS document_id,
                d."title"       AS document_title,
                c."section"     AS section,
                c."content"     AS content,
                1 - (c."embedding" <=> $1::vector) AS similarity
           FROM "DocumentChunk" c
           JOIN "Document" d ON d."id" = c."documentId"
          WHERE ${conditions.join(" AND ")}
          ORDER BY c."embedding" <=> $1::vector
          LIMIT $3`;
  return { sql, params };
}
```

Input schema de la tool — agregar:

```ts
    categoria: z.string().optional().meta({ description: "Limitar la búsqueda a una categoría del corpus (ej. laboral)" }),
    subcategorias: z
      .array(z.string())
      .optional()
      .meta({ description: "Limitar a subcategorías específicas (ej. despido)" }),
```

y en `execute`, reemplazar la query inline por:

```ts
      const { sql, params } = buildSearchQuery({
        vector: toVectorLiteral(queryEmbedding),
        minSimilarity: MIN_SIMILARITY,
        limit: input.limit,
        categoria: input.categoria,
        subcategorias: input.subcategorias,
      });
      const result = await pool.query<ChunkRow>(sql, params);
```

- [ ] **Step 4: Flags de ingesta**

En `backend/src/scripts/ingest.ts`: `parseArgs` pasa a `options: { title: { type: "string" }, categoria: { type: "string" }, subcategoria: { type: "string" } }`; el INSERT/UPSERT de `Document` agrega las columnas:

```ts
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "Document" ("id", "title", "sourceKey", "categoria", "subcategoria", "status", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, 'PROCESSING'::"ProcessingStatus", now(), now())
     ON CONFLICT ("title") DO UPDATE
        SET "sourceKey" = $2, "categoria" = $3, "subcategoria" = $4,
            "status" = 'PROCESSING'::"ProcessingStatus", "updatedAt" = now()
     RETURNING "id"`,
    [title, filePath, values.categoria ?? null, values.subcategoria ?? null],
  );
```

Actualizar el usage del error a: `pnpm ingest <archivo.txt> --title "<título>" [--categoria laboral --subcategoria despido]`.

- [ ] **Step 5: Verificar + gates**

Run: `cd backend && pnpm vitest run && pnpm lint && cd ../frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/prisma backend/src/scripts/ingest.ts backend/src/mastra/tools/documentos
git commit -m "feat: corpus partition by categoria/subcategoria in schema, ingest and retrieval"
```

---

### Task 7: Registro en Mastra + endpoint `GET /api/dominios`

**Files:**
- Modify: `backend/src/mastra/index.ts`
- Create: `backend/src/mastra/dominios/api-dominios.ts`
- Test: `backend/src/mastra/dominios/api-dominios.test.ts`

**Interfaces (Produces):**
```ts
// api-dominios.ts — payload que consume el BFF (Task 10, mantener sincronizado)
export interface DominiosPayload {
  categorias: Array<{ id: string; nombre: string; subcategoriasHabilitadas: string[] }>;
}
export function buildDominiosPayload(): DominiosPayload;
```

- [ ] **Step 1: Test que falla**

```ts
// backend/src/mastra/dominios/api-dominios.test.ts
import { describe, expect, it } from "vitest";

import { buildDominiosPayload } from "./api-dominios.js";

describe("payload de /api/dominios", () => {
  it("expone solo lo habilitado", () => {
    expect(buildDominiosPayload()).toEqual({
      categorias: [{ id: "laboral", nombre: "Laboral", subcategoriasHabilitadas: ["despido"] }],
    });
  });
});
```

Run: `cd backend && pnpm vitest run src/mastra/dominios/api-dominios.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

```ts
// backend/src/mastra/dominios/api-dominios.ts
import { categoriasHabilitadas, subcategoriasHabilitadas } from "./registry.js";

export interface DominiosPayload {
  categorias: Array<{ id: string; nombre: string; subcategoriasHabilitadas: string[] }>;
}

/** Payload for the custom route the BFF consumes server-side (spec §5). */
export function buildDominiosPayload(): DominiosPayload {
  return {
    categorias: categoriasHabilitadas().map((c) => ({
      id: c.id,
      nombre: c.nombre,
      subcategoriasHabilitadas: subcategoriasHabilitadas(c.id).map((s) => s.id),
    })),
  };
}
```

`backend/src/mastra/index.ts` completo:

```ts
import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";

import { makeLogger } from "./common/logger.js";
import { postgresStore } from "./config/storage.js";
import { buildDominiosPayload } from "./dominios/api-dominios.js";
import { laboralAgent } from "./dominios/laboral/index.js";
import { recepcionAgent } from "./dominios/recepcion/index.js";

export const mastra = new Mastra({
  agents: {
    recepcionAgent,
    laboralAgent,
  },
  storage: postgresStore,
  bundler: {
    sourcemap: true,
  },
  server: {
    // IPv6 host for Railway's internal network.
    host: process.env.HOST ?? "::",
    port: parseInt(process.env.PORT ?? "4112", 10),
    apiRoutes: [
      registerApiRoute("/api/dominios", {
        method: "GET",
        handler: async (c) => c.json(buildDominiosPayload()),
      }),
    ],
  },
  logger: makeLogger("Mastra"),
});
```

Nota: si `registerApiRoute` vive en otro subpath en la versión instalada, buscarlo con `grep -rn "registerApiRoute" node_modules/@mastra/core/dist/*.d.ts` y ajustar el import (nunca el barrel).

- [ ] **Step 3: Verificación en vivo**

Run: `cd backend && pnpm vitest run && pnpm lint && (pnpm dev &) && sleep 8 && curl -s http://localhost:4112/api/dominios && curl -s http://localhost:4112/api/agents | head -c 400; kill %1`
Expected: `{"categorias":[{"id":"laboral",...}]}` y la lista de agentes incluye `recepcion` y `laboral` (ya no `consultas`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/mastra
git commit -m "feat(backend): register domain agents from registry and expose GET /api/dominios"
```

---

### Task 8: Verificación en vivo de la mecánica de memoria (cierre del spike)

Confirma contra el server real los dos supuestos del spec §7 antes de que el BFF dependa de ellos. **Sin código de producción** — solo observación y, si hace falta, ajuste de constantes en las tasks siguientes.

**Files:** ninguno (hallazgos → actualizar la sección "Referencia de mecánica Mastra" de este plan y el gotcha en `CLAUDE.md` si aparece algo no obvio).

- [ ] **Step 1: readOnly no persiste**

```bash
cd backend && pnpm dev &
sleep 8
# Turn 1 against recepcion with readOnly memory:
curl -s -X POST http://localhost:4112/api/agents/recepcion/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"me despidieron ayer sin pagarme la liquidacion"}],
       "memory":{"thread":"chat-spike-1","resource":"spike-1","options":{"readOnly":true}},
       "requestContext":{"threadId":"chat-spike-1","resourceId":"spike-1","readOnly":{"userId":"spike-1"}}}' | head -c 2000
# Then check the thread has NO messages:
curl -s "http://localhost:4112/api/memory/threads/chat-spike-1/messages?agentId=recepcion" | head -c 400
```
Expected: el stream emite un evento de tool-call `asignar-clasificacion` (anotar el `type` exacto y dónde anida `args` — insumo de Task 11) y el GET de mensajes devuelve vacío/404.
Si el body no acepta `memory` con ese shape: probar `memoryOptions` top-level y anotar el shape ganador; las Tasks 12/13 usan la constante anotada.

- [ ] **Step 2: append por API de memoria**

```bash
curl -s -X POST "http://localhost:4112/api/memory/threads/chat-spike-2/messages?agentId=recepcion" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hola"},{"role":"assistant","content":"contame un poco más"}],"resourceId":"spike-2"}'
curl -s "http://localhost:4112/api/memory/threads/chat-spike-2/messages?agentId=recepcion" | head -c 600
kill %1
```
Expected: 200 y los dos mensajes leídos de vuelta. Anotar el shape exacto aceptado (query param `agentId`, campo `resourceId`, creación implícita del thread o necesidad de `POST /api/memory/threads` previo) — insumo de Task 12.

- [ ] **Step 3: Registrar hallazgos**

Actualizar la sección "Referencia de mecánica Mastra" al tope de este plan con los shapes confirmados. Si difieren de lo asumido, corregir los snippets de Tasks 11-13 ANTES de implementarlas. Commit solo si hubo cambios de docs:

```bash
git add docs/plans/2026-07-19-plan-implementacion-arquitectura-agentes.md CLAUDE.md
git commit -m "docs: record verified Mastra memory mechanics for the BFF orchestrator"
```

---

### Task 9: Modelo de datos del lead (Prisma) + `lib/clasificacion.ts`

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/src/lib/clasificacion.ts`
- Test: `frontend/src/lib/clasificacion.test.ts`

**Interfaces (Produces — las consume el orquestador en Task 13):**
```ts
export function getOrCreateConversation(sessionId: string): Promise<{ id: string; categoria: string | null }>;
export function asignarClasificacion(p: {
  sessionId: string; categoria: string; subcategoria?: string; brief?: string;
  casoSensible?: boolean; temaDetectado?: string;
}): Promise<{ categoria: string | null; aplicada: boolean }>;   // first-write-wins
export function registrarDatosCaso(p: {
  sessionId: string; subcategorias?: string[]; hechos?: string; interesAdicional?: string;
  contactoNombre?: string; contactoTelefono?: string; contactoEmail?: string;
}): Promise<void>;
export function corregirClasificacion(p: { sessionId: string; categoria: string; motivo: string }): Promise<{ aplicada: boolean }>;
```

- [ ] **Step 1: Schema + migración**

Agregar a `frontend/prisma/schema.prisma`:

```prisma
/// Business-side conversation record: routing state for the BFF. The message
/// history itself lives in Mastra storage (thread) — this row only pins the
/// conversation to a category (spec §6).
model Conversation {
  id            String    @id @default(cuid())
  sessionId     String    @unique
  threadId      String    @unique
  categoria     String?
  clasificadaEn DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  caso Caso?
}

/// The lead — THE deliverable of the system (vision §5). Built incrementally.
model Caso {
  id               String      @id @default(cuid())
  conversationId   String      @unique
  categoria        String?
  subcategorias    String[]    @default([])
  resumen          Json?
  contactoNombre   String?
  contactoTelefono String?
  contactoEmail    String?
  estado           CasoEstado  @default(EN_CONVERSACION)
  origen           CasoOrigen  @default(DOMINIO)
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  eventos      CasoEvento[]

  @@index([estado, updatedAt(sort: Desc)])
}

/// Append-only audit trail for the human team that classifies and derives.
model CasoEvento {
  id        String         @id @default(cuid())
  casoId    String
  tipo      CasoEventoTipo
  payload   Json
  createdAt DateTime       @default(now())

  caso Caso @relation(fields: [casoId], references: [id], onDelete: Cascade)

  @@index([casoId, createdAt])
}

enum CasoEstado {
  EN_CONVERSACION
  CAPTADO
  FUERA_DE_COBERTURA
}

enum CasoOrigen {
  DOMINIO
  FUERA_DE_COBERTURA
}

enum CasoEventoTipo {
  CLASIFICACION
  CORRECCION
  REGISTRO_DATO
  CONTACTO
}
```

Run: `cd frontend && pnpm prisma migrate dev --name caso-lead-y-conversacion`
Expected: migración aplicada.

- [ ] **Step 2: Test que falla** (mock del cliente Prisma; seguir el patrón de mocks de vitest del repo)

```ts
// frontend/src/lib/clasificacion.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  conversation: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  caso: { create: vi.fn(), upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  casoEvento: { create: vi.fn(), count: vi.fn() },
};
vi.mock("./prisma", () => ({
  prisma: { ...tx, $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) },
}));

import { asignarClasificacion, corregirClasificacion } from "./clasificacion";

describe("asignarClasificacion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("first-write-wins: no pisa una categoría ya asignada", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral" });
    const result = await asignarClasificacion({ sessionId: "s1", categoria: "familia" });
    expect(result).toEqual({ categoria: "laboral", aplicada: false });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it("asigna, crea el caso y registra el evento CLASIFICACION", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.upsert.mockResolvedValue({ id: "k1" });
    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "laboral",
      subcategoria: "despido",
      brief: "despido sin liquidación",
    });
    expect(result.aplicada).toBe(true);
    expect(tx.conversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", categoria: null },
        data: expect.objectContaining({ categoria: "laboral" }),
      }),
    );
    expect(tx.casoEvento.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: "CLASIFICACION" }) }),
    );
  });

  it("escape fuera de cobertura: no asigna categoría de ruteo, marca el caso", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: null });
    tx.caso.upsert.mockResolvedValue({ id: "k1" });
    const result = await asignarClasificacion({
      sessionId: "s1",
      categoria: "categoria-no-habilitada",
      temaDetectado: "sucesiones",
    });
    expect(result).toEqual({ categoria: null, aplicada: false });
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.caso.upsert).toHaveBeenCalled(); // demand signal recorded
  });
});

describe("corregirClasificacion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aplica una sola corrección por conversación", async () => {
    tx.conversation.findUnique.mockResolvedValue({ id: "c1", categoria: "laboral", caso: { id: "k1" } });
    tx.casoEvento.count.mockResolvedValue(1); // already corrected once
    const result = await corregirClasificacion({ sessionId: "s1", categoria: "familia", motivo: "x" });
    expect(result.aplicada).toBe(false);
  });
});
```

Run: `cd frontend && pnpm vitest run src/lib/clasificacion.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar `lib/clasificacion.ts`**

```ts
// frontend/src/lib/clasificacion.ts
import "server-only";

import { prisma } from "./prisma";
import { threadIdForSession } from "./session";

const ESCAPES = new Set(["fuera-de-universo", "categoria-no-habilitada"]);

export async function getOrCreateConversation(sessionId: string): Promise<{ id: string; categoria: string | null }> {
  const conversation = await prisma.conversation.upsert({
    where: { sessionId },
    create: { sessionId, threadId: threadIdForSession(sessionId) },
    update: {},
    select: { id: true, categoria: true },
  });
  return conversation;
}

/**
 * Persists the receptor's classification. Idempotent, first-write-wins: a
 * concurrent double-submit or a re-emitted event never overwrites (spec §6).
 * Escapes never become routing state — they only mark the caso as demand signal.
 */
export async function asignarClasificacion(params: {
  sessionId: string;
  categoria: string;
  subcategoria?: string;
  brief?: string;
  casoSensible?: boolean;
  temaDetectado?: string;
}): Promise<{ categoria: string | null; aplicada: boolean }> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true },
    });
    if (!conversation) return { categoria: null, aplicada: false };
    if (conversation.categoria) return { categoria: conversation.categoria, aplicada: false };

    const esEscape = ESCAPES.has(params.categoria);
    const caso = await tx.caso.upsert({
      where: { conversationId: conversation.id },
      create: {
        conversationId: conversation.id,
        categoria: esEscape ? null : params.categoria,
        subcategorias: params.subcategoria ? [params.subcategoria] : [],
        resumen: params.brief ? { brief: params.brief } : undefined,
        estado: esEscape ? "FUERA_DE_COBERTURA" : "EN_CONVERSACION",
        origen: esEscape ? "FUERA_DE_COBERTURA" : "DOMINIO",
      },
      update: {},
      select: { id: true },
    });
    await tx.casoEvento.create({
      data: {
        casoId: caso.id,
        tipo: "CLASIFICACION",
        payload: {
          categoria: params.categoria,
          subcategoria: params.subcategoria ?? null,
          casoSensible: params.casoSensible ?? false,
          temaDetectado: params.temaDetectado ?? null,
        },
      },
    });

    if (esEscape) return { categoria: null, aplicada: false };

    // Guarded write: double-submit safe even if two transactions read
    // categoria=null concurrently — only one row with categoria still null
    // gets updated (spec §6 idempotent upsert).
    const updated = await tx.conversation.updateMany({
      where: { id: conversation.id, categoria: null },
      data: { categoria: params.categoria, clasificadaEn: new Date() },
    });
    if (updated.count === 0) return { categoria: conversation.categoria, aplicada: false };
    return { categoria: params.categoria, aplicada: true };
  });
}

/** Incremental lead capture: merges data as it appears (spec §4). */
export async function registrarDatosCaso(params: {
  sessionId: string;
  subcategorias?: string[];
  hechos?: string;
  interesAdicional?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, caso: { select: { id: true, subcategorias: true, resumen: true } } },
    });
    if (!conversation) return;

    const caso =
      conversation.caso ??
      (await tx.caso.create({
        data: { conversationId: conversation.id, categoria: conversation.categoria },
        select: { id: true, subcategorias: true, resumen: true },
      }));

    const subcategorias = params.subcategorias
      ? Array.from(new Set([...caso.subcategorias, ...params.subcategorias]))
      : undefined;
    const resumenPrevio = (caso.resumen as Record<string, unknown> | null) ?? {};
    const hechosPrevios = typeof resumenPrevio.hechos === "string" ? `${resumenPrevio.hechos}\n` : "";
    const interesesPrevios = typeof resumenPrevio.intereses === "string" ? `${resumenPrevio.intereses}\n` : "";

    const tieneContacto = Boolean(params.contactoNombre || params.contactoTelefono || params.contactoEmail);
    await tx.caso.update({
      where: { id: caso.id },
      data: {
        ...(subcategorias ? { subcategorias } : {}),
        resumen: {
          ...resumenPrevio,
          ...(params.hechos ? { hechos: `${hechosPrevios}${params.hechos}` } : {}),
          ...(params.interesAdicional ? { intereses: `${interesesPrevios}${params.interesAdicional}` } : {}),
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

/** Bounded reclassification: at most ONE correction per conversation (spec §6). */
export async function corregirClasificacion(params: {
  sessionId: string;
  categoria: string;
  motivo: string;
}): Promise<{ aplicada: boolean }> {
  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { sessionId: params.sessionId },
      select: { id: true, categoria: true, caso: { select: { id: true } } },
    });
    if (!conversation?.caso) return { aplicada: false };

    const correcciones = await tx.casoEvento.count({
      where: { casoId: conversation.caso.id, tipo: "CORRECCION" },
    });
    if (correcciones >= 1) return { aplicada: false };

    await tx.casoEvento.create({
      data: {
        casoId: conversation.caso.id,
        tipo: "CORRECCION",
        payload: { de: conversation.categoria, a: params.categoria, motivo: params.motivo },
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { categoria: params.categoria, clasificadaEn: new Date() },
    });
    await tx.caso.update({ where: { id: conversation.caso.id }, data: { categoria: params.categoria } });
    return { aplicada: true };
  });
}
```

- [ ] **Step 4: Verificar + gates**

Run: `cd frontend && pnpm vitest run src/lib/clasificacion.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma frontend/src/lib/clasificacion.ts frontend/src/lib/clasificacion.test.ts
git commit -m "feat(frontend): lead data model (Caso/CasoEvento) and classification persistence"
```

---

### Task 10: `lib/dominios.ts` — registry en el BFF con cache TTL

**Files:**
- Create: `frontend/src/lib/dominios.ts`
- Test: `frontend/src/lib/dominios.test.ts`

**Interfaces (Produces):**
```ts
export interface DominioHabilitado { id: string; nombre: string; subcategoriasHabilitadas: string[] }
export function getDominios(): Promise<DominioHabilitado[]>;           // cache 60s
export function esCategoriaHabilitada(id: string): Promise<boolean>;
export function subcategoriaUnica(categoriaId: string): Promise<string | null>;
export function invalidateDominiosCache(): void;                        // tests
```

- [ ] **Step 1: Test que falla**

```ts
// frontend/src/lib/dominios.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { esCategoriaHabilitada, getDominios, invalidateDominiosCache, subcategoriaUnica } from "./dominios";

const payload = {
  categorias: [{ id: "laboral", nombre: "Laboral", subcategoriasHabilitadas: ["despido"] }],
};

describe("lib/dominios", () => {
  afterEach(() => {
    invalidateDominiosCache();
    vi.unstubAllGlobals();
  });

  it("cachea el fetch al backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetchMock);
    await getDominios();
    await getDominios();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("responde habilitación y cortocircuito de subcategoría única", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    expect(await esCategoriaHabilitada("laboral")).toBe(true);
    expect(await esCategoriaHabilitada("familia")).toBe(false);
    expect(await subcategoriaUnica("laboral")).toBe("despido");
  });
});
```

Run: `cd frontend && pnpm vitest run src/lib/dominios.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

```ts
// frontend/src/lib/dominios.ts
import "server-only";

import { z } from "zod";

import { getMastraBaseUrl } from "./agent-service";

const dominiosSchema = z.object({
  categorias: z.array(
    z.object({ id: z.string(), nombre: z.string(), subcategoriasHabilitadas: z.array(z.string()) }),
  ),
});

export type DominioHabilitado = z.infer<typeof dominiosSchema>["categorias"][number];

const CACHE_TTL_MS = 60_000;
let cache: { at: number; value: DominioHabilitado[] } | null = null;

/** Enabled domains from the backend registry (GET /dominios), cached in-process. */
export async function getDominios(): Promise<DominioHabilitado[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const response = await fetch(`${getMastraBaseUrl()}/dominios`);
  if (!response.ok) throw new Error(`GET /dominios responded ${response.status}`);
  const parsed = dominiosSchema.parse(await response.json());
  cache = { at: Date.now(), value: parsed.categorias };
  return parsed.categorias;
}

export async function esCategoriaHabilitada(id: string): Promise<boolean> {
  return (await getDominios()).some((c) => c.id === id);
}

/** Degenerate-level shortcut (spec §5): single enabled subcategory → auto-assign. */
export async function subcategoriaUnica(categoriaId: string): Promise<string | null> {
  const categoria = (await getDominios()).find((c) => c.id === categoriaId);
  if (!categoria) return null;
  return categoria.subcategoriasHabilitadas.length === 1 ? categoria.subcategoriasHabilitadas[0] : null;
}

export function invalidateDominiosCache(): void {
  cache = null;
}
```

- [ ] **Step 3: Verificar + gates**

Run: `cd frontend && pnpm vitest run src/lib/dominios.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/dominios.ts frontend/src/lib/dominios.test.ts
git commit -m "feat(frontend): BFF-side domain registry client with TTL cache"
```

---

### Task 11: Parser SSE — eventos tool-call

**Files:**
- Modify: `frontend/src/utils/sse.ts`
- Modify: `frontend/src/utils/sse.test.ts`

**Interfaces (Produces):**
```ts
export interface SseToolCallEvent { kind: "tool-call"; toolName: string; args: Record<string, unknown>; }
export type SseEvent = SseTextEvent | SseErrorEvent | SseToolCallEvent | null;
```

- [ ] **Step 1: Tests que fallan** (usar el shape real anotado en Task 8; el snippet asume el shape nativo de Mastra `{ type: "tool-call", payload: { toolName, args } }` con tolerancia a variantes AI SDK)

```ts
// añadir a frontend/src/utils/sse.test.ts
describe("parseSseData tool-call", () => {
  it("extrae toolName y args del shape nativo de Mastra", () => {
    const event = parseSseData(
      JSON.stringify({ type: "tool-call", payload: { toolName: "asignar-clasificacion", args: { categoria: "laboral" } } }),
    );
    expect(event).toEqual({
      kind: "tool-call",
      toolName: "asignar-clasificacion",
      args: { categoria: "laboral" },
    });
  });

  it("tolera el shape AI SDK top-level", () => {
    const event = parseSseData(
      JSON.stringify({ type: "tool-call", toolName: "registrar-caso", input: { hechos: "x" } }),
    );
    expect(event).toEqual({ kind: "tool-call", toolName: "registrar-caso", args: { hechos: "x" } });
  });

  it("ignora tool-calls sin nombre", () => {
    expect(parseSseData(JSON.stringify({ type: "tool-call", payload: {} }))).toBeNull();
  });
});
```

Run: `cd frontend && pnpm vitest run src/utils/sse.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar** — agregar a `sse.ts`:

```ts
export interface SseToolCallEvent {
  kind: "tool-call";
  toolName: string;
  args: Record<string, unknown>;
}
```

extender `SseEvent` y, dentro de `parseSseData`, antes del `return null` final:

```ts
  if (type === "tool-call") {
    const rawName = nested.toolName ?? event.toolName ?? nested.toolId ?? event.toolId;
    const rawArgs = nested.args ?? event.args ?? nested.input ?? event.input;
    if (typeof rawName !== "string" || rawName.length === 0) return null;
    const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};
    return { kind: "tool-call", toolName: rawName, args };
  }
```

(`useChatStream` ignora los eventos `tool-call` sin cambios: su switch solo consume `text`/`error`.)

- [ ] **Step 3: Verificar + gates**

Run: `cd frontend && pnpm vitest run src/utils/sse.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils
git commit -m "feat(frontend): tolerant tool-call parsing in the SSE utilities"
```

---

### Task 12: `agent-service` — agentId dinámico, memoria readOnly y append de mensajes

**Files:**
- Modify: `frontend/src/lib/agent-service.ts`
- Test: `frontend/src/lib/agent-service.test.ts` (nuevo)

**Interfaces (Produces):**
```ts
export interface StreamAgentParams {
  agentId: string;                 // "recepcion" | id de categoría del registry
  threadId: string; userId: string; userName?: string; message: string;
  casoBrief?: string;              // se inyecta en requestContext.readOnly
  memoryReadOnly?: boolean;        // true → el turno no persiste (receptor)
  signal?: AbortSignal;
}
export function streamAgentMessage(params: StreamAgentParams): Promise<Response>;
export function appendThreadMessages(p: {
  threadId: string; agentId: string; resourceId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<void>;                 // slow-path: persistir el par pregunta/respuesta del receptor
```

- [ ] **Step 1: Test que falla**

```ts
// frontend/src/lib/agent-service.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { appendThreadMessages, streamAgentMessage } from "./agent-service";

describe("agent-service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("memoryReadOnly agrega la opción de memoria de solo lectura", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    await streamAgentMessage({
      agentId: "recepcion",
      threadId: "chat-s1",
      userId: "s1",
      message: "hola",
      memoryReadOnly: true,
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.memory).toEqual({ thread: "chat-s1", resource: "s1", options: { readOnly: true } });
    expect((fetchMock.mock.calls[0][0] as string)).toContain("/api/agents/recepcion/stream");
  });

  it("appendThreadMessages pega a /api/memory/save-messages con threadId/resourceId por mensaje", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await appendThreadMessages({
      threadId: "chat-s1",
      agentId: "recepcion",
      resourceId: "s1",
      messages: [{ role: "user", content: "hola" }],
    });
    expect(fetchMock.mock.calls[0][0]).toContain("/api/memory/save-messages?agentId=recepcion");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      messages: Array<Record<string, unknown>>;
    };
    expect(body.messages[0]).toEqual({ threadId: "chat-s1", resourceId: "s1", role: "user", content: "hola" });
  });
});
```

Nota (Task 8, 2026-07-19): NO existe `POST /api/memory/threads/:threadId/messages` en la
versión instalada (ese path es GET-only). El endpoint real es
`POST /api/memory/save-messages?agentId=...` con `threadId`/`resourceId` **por mensaje**
dentro del array, no como campo hermano top-level. Ver detalle en `task-8-report.md`.

Run: `cd frontend && pnpm vitest run src/lib/agent-service.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar** — `agent-service.ts` queda:

```ts
import "server-only";

/**
 * Single point of access to the Mastra agents backend. Nothing else reads
 * MASTRA_BASE_URL.
 */

const DEFAULT_BASE_URL = "http://localhost:4112";

export function getMastraBaseUrl(): string {
  return process.env.MASTRA_BASE_URL ?? DEFAULT_BASE_URL;
}

export interface StreamAgentParams {
  /** Registry-driven agent id ("recepcion" or a category id). */
  agentId: string;
  threadId: string;
  /** Business user id — used as Mastra resourceId. */
  userId: string;
  userName?: string;
  message: string;
  /** Case brief from the receptor's classification, re-injected so the category agent never re-asks. */
  casoBrief?: string;
  /** true → the turn persists nothing (receptor runs; the category agent owns the durable turn). */
  memoryReadOnly?: boolean;
  signal?: AbortSignal;
}

export async function streamAgentMessage(params: StreamAgentParams): Promise<Response> {
  const url = `${getMastraBaseUrl()}/api/agents/${params.agentId}/stream`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: params.signal,
    body: JSON.stringify({
      messages: [{ role: "user", content: params.message }],
      threadId: params.threadId,
      resourceId: params.userId,
      ...(params.memoryReadOnly
        ? { memory: { thread: params.threadId, resource: params.userId, options: { readOnly: true } } }
        : {}),
      requestContext: {
        threadId: params.threadId,
        resourceId: params.userId,
        readOnly: {
          userId: params.userId,
          userName: params.userName,
          casoBrief: params.casoBrief,
        },
      },
    }),
  });
}

/**
 * Slow-path persistence: append the receptor's question exchange to the shared
 * thread. Uses `POST /api/memory/save-messages` (Task 8, 2026-07-19: the
 * originally-assumed `POST /api/memory/threads/:threadId/messages` does not exist
 * in the installed version — that path is GET-only). `threadId`/`resourceId` go on
 * each message, not as a sibling top-level field.
 *
 * The endpoint requires the thread to already exist (500 `"Thread ... not found"`
 * otherwise) — no implicit creation. In the BFF's actual flow this is expected to
 * be a no-op in practice: the immediately-preceding readOnly stream call to
 * `recepcion` on this same threadId already creates the thread row as a side
 * effect (Task 8 finding). Still, callers must not assume this holds for every
 * path into `appendThreadMessages` — if a caller ever hits it without a prior
 * readOnly turn on that thread, `POST /api/memory/threads` must run first.
 */
export async function appendThreadMessages(params: {
  threadId: string;
  agentId: string;
  resourceId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<void> {
  const url = `${getMastraBaseUrl()}/api/memory/save-messages?agentId=${params.agentId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: params.messages.map((message) => ({
        threadId: params.threadId,
        resourceId: params.resourceId,
        role: message.role,
        content: message.content,
      })),
    }),
  });
  if (!response.ok) {
    throw new Error(`appendThreadMessages responded ${response.status}`);
  }
}
```

- [ ] **Step 3: Verificar + gates**

Run: `cd frontend && pnpm vitest run src/lib/agent-service.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/agent-service.ts frontend/src/lib/agent-service.test.ts
git commit -m "feat(frontend): registry-driven agent calls, readOnly memory option and thread append"
```

---

### Task 13: Orquestador del chat — ruteo, observación, same-turn y endurecimiento

La pieza central. Vive en `lib/` (route handler delgado). Se testea con streams sintéticos.

**Files:**
- Create: `frontend/src/lib/chat-orchestrator.ts`
- Modify: `frontend/src/app/api/chat/stream/route.ts`
- Test: `frontend/src/lib/chat-orchestrator.test.ts`

**Interfaces:**
- Consumes: Tasks 9-12 (`getOrCreateConversation`, `asignarClasificacion`, `registrarDatosCaso`, `corregirClasificacion`, `subcategoriaUnica`, `streamAgentMessage`, `appendThreadMessages`, `parseSseData`, `createSseLineSplitter`).
- Produces:
```ts
export function orchestrateChatTurn(p: { sessionId: string; message: string }): Promise<Response>;
```

**Diseño interno (fijado por el spec §7):**
1. `conversation = getOrCreateConversation(sessionId)`.
2. **Con categoría** → `streamAgentMessage({ agentId: categoria, ... })` y pipe al cliente a través del observador: `registrar-caso` → `registrarDatosCaso`; `corregir-clasificacion` → `corregirClasificacion` (si `aplicada: false`, solo log — el agente ya fue instruido de su límite).
3. **Sin categoría** → receptor con `memoryReadOnly: true`. El observador bufferea el texto del receptor SIN emitirlo al cliente hasta decidir el camino (el fast-path no emite texto; el slow-path lo emite al confirmarse que no hubo clasificación con texto ya presente):
   - **fast-path** (tool-call `asignar-clasificacion` con categoría habilitada): persistir (+ `subcategoriaUnica` → `registrarDatosCaso` cortocircuito), cortar el stream del receptor, invocar `streamAgentMessage({ agentId: categoria, casoBrief: brief, ... })` (memoria normal) y pipear su stream al MISMO response. El turno durable lo persiste solo el agente de categoría — cero duplicación.
   - **escape** (`fuera-de-universo` / `categoria-no-habilitada`): persistir la señal, emitir el texto del receptor (su despedida honesta/oferta de captación) al cliente. La conversación queda sin categoría; el próximo mensaje vuelve al receptor. Como el receptor corre readOnly, appendear el par `[user, assistant]` vía `appendThreadMessages` para que no se pierda el contexto.
   - **slow-path** (fin del stream sin tool-call de clasificación): emitir el texto buffereado y appendear `[user, assistant]` vía `appendThreadMessages`.
4. **Desacople del abort**: el fetch upstream NO recibe `request.signal`. Si el cliente se desconecta, el orquestador sigue drenando el upstream para observar y persistir tool-calls (enqueue al cliente falla silencioso con try/catch).
5. **Nunca loguear payloads**: solo `toolName` y banderas booleanas (PII, spec §8).
6. **Sobre el endurecimiento #2 del spec (reconciliación)**: el diseño readOnly lo vuelve innecesario — como el turno del receptor no persiste NADA en el thread, ya no existe la clase de divergencia "Mastra tiene la asignación pero Prisma no". Si el BFF muere antes de persistir, no quedó rastro en ningún lado y el próximo mensaje re-corre el receptor de forma limpia e idempotente. Documentar esta decisión en la Task 17.

- [ ] **Step 1: Tests que fallan** (helper de streams sintéticos incluido)

```ts
// frontend/src/lib/chat-orchestrator.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const clasificacion = {
  getOrCreateConversation: vi.fn(),
  asignarClasificacion: vi.fn(),
  registrarDatosCaso: vi.fn(),
  corregirClasificacion: vi.fn(),
};
const dominios = { subcategoriaUnica: vi.fn() };
const agentService = { streamAgentMessage: vi.fn(), appendThreadMessages: vi.fn() };

vi.mock("./clasificacion", () => clasificacion);
vi.mock("./dominios", () => ({ ...dominios, esCategoriaHabilitada: vi.fn().mockResolvedValue(true) }));
vi.mock("./agent-service", () => agentService);

import { orchestrateChatTurn } from "./chat-orchestrator";

function sseResponse(events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(new Blob([body]).stream(), { headers: { "Content-Type": "text/event-stream" } });
}

async function drain(response: Response): Promise<string> {
  return new Response(response.body).text();
}

const asignacionLaboral = {
  type: "tool-call",
  payload: {
    toolName: "asignar-clasificacion",
    args: { categoria: "laboral", subcategoria: "despido", confianza: "alta", casoSensible: false, brief: "b" },
  },
};

describe("orchestrateChatTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clasificacion.asignarClasificacion.mockResolvedValue({ categoria: "laboral", aplicada: true });
    clasificacion.registrarDatosCaso.mockResolvedValue(undefined);
    agentService.appendThreadMessages.mockResolvedValue(undefined);
    dominios.subcategoriaUnica.mockResolvedValue("despido");
  });

  it("con categoría asignada rutea directo al agente de categoría", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "y el aguinaldo?" });
    expect(agentService.streamAgentMessage).toHaveBeenCalledTimes(1);
    expect(agentService.streamAgentMessage.mock.calls[0][0]).toMatchObject({ agentId: "laboral" });
    expect(await drain(response)).toContain("hola");
  });

  it("fast-path: clasifica, persiste, encadena al agente de categoría en el mismo turno", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    agentService.streamAgentMessage
      .mockResolvedValueOnce(sseResponse([asignacionLaboral])) // receptor: tool-call, no text
      .mockResolvedValueOnce(sseResponse([{ type: "text-delta", payload: { text: "Sobre tu despido..." } }]));
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "me despidieron sin pagarme" });
    const text = await drain(response);
    expect(text).toContain("Sobre tu despido...");
    expect(clasificacion.asignarClasificacion).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: "laboral", subcategoria: "despido" }),
    );
    // receptor readOnly + category agent normal:
    expect(agentService.streamAgentMessage.mock.calls[0][0]).toMatchObject({ agentId: "recepcion", memoryReadOnly: true });
    expect(agentService.streamAgentMessage.mock.calls[1][0]).toMatchObject({ agentId: "laboral", casoBrief: "b" });
    // degenerate-level shortcut recorded:
    expect(clasificacion.registrarDatosCaso).toHaveBeenCalledWith(
      expect.objectContaining({ subcategorias: ["despido"] }),
    );
  });

  it("slow-path: sin clasificación emite la pregunta del receptor y la appendea al thread", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    agentService.streamAgentMessage.mockResolvedValueOnce(
      sseResponse([{ type: "text-delta", payload: { text: "¿Hace cuánto trabajás ahí?" } }]),
    );
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "tengo un problema" });
    expect(await drain(response)).toContain("¿Hace cuánto trabajás ahí?");
    expect(agentService.appendThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "tengo un problema" },
          { role: "assistant", content: "¿Hace cuánto trabajás ahí?" },
        ],
      }),
    );
  });

  it("observa registrar-caso en régimen y persiste los datos", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    agentService.streamAgentMessage.mockResolvedValue(
      sseResponse([
        { type: "tool-call", payload: { toolName: "registrar-caso", args: { contactoNombre: "Ana", contactoTelefono: "099" } } },
        { type: "text-delta", payload: { text: "¡Gracias Ana!" } },
      ]),
    );
    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "soy Ana, 099..." }));
    expect(clasificacion.registrarDatosCaso).toHaveBeenCalledWith(
      expect.objectContaining({ contactoNombre: "Ana", contactoTelefono: "099" }),
    );
  });
});
```

Run: `cd frontend && pnpm vitest run src/lib/chat-orchestrator.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar `chat-orchestrator.ts`**

```ts
// frontend/src/lib/chat-orchestrator.ts
import "server-only";

import { createSseLineSplitter, parseSseData } from "@/utils/sse";
import { logger } from "@/utils/logger";

import { appendThreadMessages, streamAgentMessage } from "./agent-service";
import {
  asignarClasificacion,
  corregirClasificacion,
  getOrCreateConversation,
  registrarDatosCaso,
} from "./clasificacion";
import { subcategoriaUnica } from "./dominios";
import { threadIdForSession } from "./session";

const ESCAPES = new Set(["fuera-de-universo", "categoria-no-habilitada"]);
const RECEPCION_AGENT_ID = "recepcion";

interface AsignacionArgs {
  categoria: string;
  subcategoria?: string;
  brief?: string;
  casoSensible?: boolean;
  temaDetectado?: string;
}

interface ReceptorOutcome {
  kind: "clasificada" | "escape" | "pregunta";
  args?: AsignacionArgs;
  text: string;
  rawEvents: string[];
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

function encodeSseText(text: string): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify({ type: "text-delta", payload: { text } })}\n\n`);
}

/**
 * Consumes an upstream SSE response to completion, invoking callbacks per
 * parsed event. Decoupled from the client connection: it always drains fully
 * so observed tool-calls are persisted even if the browser disconnected
 * (spec §7 hardening #1).
 */
async function consumeUpstream(
  upstream: Response,
  handlers: {
    onText?: (text: string, raw: string) => void | Promise<void>;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => void | Promise<void>;
    onRaw?: (rawLine: string) => void | Promise<void>;
  },
): Promise<void> {
  if (!upstream.body) return;
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const feed = createSseLineSplitter();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const data of feed(decoder.decode(value, { stream: true }))) {
      await handlers.onRaw?.(data);
      const event = parseSseData(data);
      if (!event) continue;
      if (event.kind === "text") await handlers.onText?.(event.text, data);
      if (event.kind === "tool-call") await handlers.onToolCall?.(event.toolName, event.args);
    }
  }
}

/** Runs the receptor turn (readOnly memory), buffering everything. */
async function runReceptor(params: { sessionId: string; message: string }): Promise<ReceptorOutcome> {
  const upstream = await streamAgentMessage({
    agentId: RECEPCION_AGENT_ID,
    threadId: threadIdForSession(params.sessionId),
    userId: params.sessionId,
    message: params.message,
    memoryReadOnly: true,
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`receptor stream responded ${upstream.status}`);
  }

  let asignacion: AsignacionArgs | null = null;
  let text = "";
  const rawEvents: string[] = [];
  await consumeUpstream(upstream, {
    onRaw: (raw) => {
      rawEvents.push(raw);
    },
    onText: (delta) => {
      text += delta;
    },
    onToolCall: (toolName, args) => {
      if (toolName === "asignar-clasificacion") asignacion = args as unknown as AsignacionArgs;
    },
  });

  if (asignacion) {
    const kind = ESCAPES.has((asignacion as AsignacionArgs).categoria) ? "escape" : "clasificada";
    return { kind, args: asignacion, text, rawEvents };
  }
  return { kind: "pregunta", text, rawEvents };
}

/** Streams a category-agent turn to the client while observing case tool-calls. */
function pipeCategoryTurn(params: {
  sessionId: string;
  upstream: Response;
}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      void consumeUpstream(params.upstream, {
        onRaw: (raw) => {
          try {
            controller.enqueue(encoder.encode(`data: ${raw}\n\n`));
          } catch {
            // Client gone — keep draining so tool-calls still persist.
          }
        },
        onToolCall: async (toolName, args) => {
          try {
            if (toolName === "registrar-caso") {
              await registrarDatosCaso({ sessionId: params.sessionId, ...(args as object) });
            } else if (toolName === "corregir-clasificacion") {
              const result = await corregirClasificacion({
                sessionId: params.sessionId,
                categoria: String(args.categoria ?? ""),
                motivo: String(args.motivo ?? ""),
              });
              if (!result.aplicada) logger.warn("corregir-clasificacion rejected", { toolName });
            }
          } catch (error) {
            // Persistence must never break the user-facing stream.
            logger.error("tool-call persistence failed", {
              toolName,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      })
        .catch((error: unknown) => {
          logger.error("upstream consumption failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}

async function callCategoryAgent(params: {
  sessionId: string;
  categoria: string;
  message: string;
  casoBrief?: string;
}): Promise<Response> {
  const upstream = await streamAgentMessage({
    agentId: params.categoria,
    threadId: threadIdForSession(params.sessionId),
    userId: params.sessionId,
    message: params.message,
    casoBrief: params.casoBrief,
    // NOTE: no client signal — upstream consumption is decoupled from aborts.
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error(`category agent stream responded ${upstream.status}`);
  }
  return pipeCategoryTurn({ sessionId: params.sessionId, upstream });
}

/**
 * One chat turn (spec §7): route by persisted classification; without it, run
 * the receptor and either chain to the category agent in the SAME response
 * (fast-path) or emit the receptor's question (slow-path, appended to the
 * thread since the receptor runs readOnly).
 */
export async function orchestrateChatTurn(params: { sessionId: string; message: string }): Promise<Response> {
  const conversation = await getOrCreateConversation(params.sessionId);

  if (conversation.categoria) {
    return callCategoryAgent({
      sessionId: params.sessionId,
      categoria: conversation.categoria,
      message: params.message,
    });
  }

  const outcome = await runReceptor(params);

  if (outcome.kind === "clasificada" && outcome.args) {
    const asignada = await asignarClasificacion({ sessionId: params.sessionId, ...outcome.args });
    if (asignada.categoria) {
      const unica = await subcategoriaUnica(asignada.categoria);
      if (unica && !outcome.args.subcategoria) {
        await registrarDatosCaso({ sessionId: params.sessionId, subcategorias: [unica] });
      } else if (outcome.args.subcategoria) {
        await registrarDatosCaso({ sessionId: params.sessionId, subcategorias: [outcome.args.subcategoria] });
      }
      return callCategoryAgent({
        sessionId: params.sessionId,
        categoria: asignada.categoria,
        message: params.message,
        casoBrief: outcome.args.brief,
      });
    }
  }

  if (outcome.kind === "escape" && outcome.args) {
    await asignarClasificacion({ sessionId: params.sessionId, ...outcome.args });
  }

  // Question / escape farewell: emit buffered receptor text and persist the
  // exchange (the receptor ran readOnly, so nothing was saved upstream).
  if (outcome.text.length > 0) {
    await appendThreadMessages({
      threadId: threadIdForSession(params.sessionId),
      agentId: RECEPCION_AGENT_ID,
      resourceId: params.sessionId,
      messages: [
        { role: "user", content: params.message },
        { role: "assistant", content: outcome.text },
      ],
    }).catch((error: unknown) => {
      logger.error("appendThreadMessages failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (outcome.text.length > 0) controller.enqueue(encodeSseText(outcome.text));
      controller.close();
    },
  });
  return new Response(stream, { headers: sseHeaders() });
}
```

- [ ] **Step 3: Route handler delgado** — `frontend/src/app/api/chat/stream/route.ts` queda:

```ts
import { NextResponse } from "next/server";

import { orchestrateChatTurn } from "@/lib/chat-orchestrator";
import { getOrCreateSessionId } from "@/lib/session";
import { parseRequestBody, sendMessageSchema } from "@/lib/validations";
import { logger } from "@/utils/logger";

/**
 * SSE proxy: routes each message by the conversation's persisted
 * classification (lib/chat-orchestrator). The browser never talks to the
 * Mastra backend directly.
 * TODO: rate limit per session/IP before exposing to real traffic (Task 14).
 */
export async function POST(request: Request) {
  try {
    const validation = await parseRequestBody(request, sendMessageSchema);
    if (!validation.success) return validation.response;

    const sessionId = await getOrCreateSessionId();
    return await orchestrateChatTurn({ sessionId, message: validation.data.message });
  } catch (error) {
    logger.error("chat/stream failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verificar + gates**

Run: `cd frontend && pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: PASS (todo el suite del FE verde).

- [ ] **Step 5: Prueba en vivo del flujo completo**

```bash
cd backend && pnpm dev &
cd frontend && pnpm dev &
sleep 12
curl -s -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"me despidieron ayer y no me pagaron la liquidacion, que puedo reclamar?"}' | head -c 3000
```
Expected: UN solo response SSE cuyo texto es la respuesta sustantiva del agente laboral (sin preguntas clasificatorias visibles). Verificar en la DB: `Conversation.categoria = 'laboral'`, `Caso.subcategorias` contiene `despido`, y el thread de Mastra tiene el mensaje UNA sola vez (query al endpoint de memoria de Task 8).
Matar ambos dev servers al final (`kill %1 %2`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/chat-orchestrator.ts frontend/src/lib/chat-orchestrator.test.ts frontend/src/app/api/chat/stream/route.ts
git commit -m "feat(frontend): chat orchestrator with persisted routing, tool-call observation and same-turn chaining"
```

---

### Task 14: Rate limiting básico del chat

El primer turno ahora multiplica llamadas LLM en una ruta pública anónima (riesgo señalado en el análisis del spec). Token bucket in-memory por sesión (v1: una sola instancia FE).

**Files:**
- Create: `frontend/src/lib/rate-limit.ts`
- Modify: `frontend/src/app/api/chat/stream/route.ts`
- Test: `frontend/src/lib/rate-limit.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// frontend/src/lib/rate-limit.test.ts
import { describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("permite hasta el límite y después rechaza con retryAfter", () => {
    vi.useFakeTimers();
    const key = "sess-test-1";
    for (let i = 0; i < 10; i++) expect(checkRateLimit(key).allowed).toBe(true);
    const denied = checkRateLimit(key);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(key).allowed).toBe(true);
    vi.useRealTimers();
  });
});
```

Run: `cd frontend && pnpm vitest run src/lib/rate-limit.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

```ts
// frontend/src/lib/rate-limit.ts
import "server-only";

/** 10 messages/minute per session — in-memory sliding window (v1: single FE instance). */
const LIMIT = 10;
const WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { allowed: true };
}
```

En el route handler, después de `getOrCreateSessionId()`:

```ts
    const rate = checkRateLimit(sessionId);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Demasiados mensajes seguidos. Esperá un momento e intentá de nuevo." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds ?? 60) } },
      );
    }
```

(y el import `import { checkRateLimit } from "@/lib/rate-limit";` + borrar el TODO del comentario).

- [ ] **Step 3: Verificar + gates**

Run: `cd frontend && pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/rate-limit.ts frontend/src/lib/rate-limit.test.ts frontend/src/app/api/chat/stream/route.ts
git commit -m "feat(frontend): per-session rate limit on the public chat route"
```

---

### Task 15: Redacción de PII en ambos loggers

**Files:**
- Modify: `frontend/src/utils/logger.ts`
- Test: `frontend/src/utils/logger.test.ts` (nuevo)
- Modify: `backend/src/mastra/common/logger.ts` (redacción equivalente si el factory lo permite)

- [ ] **Step 1: Test que falla**

```ts
// frontend/src/utils/logger.test.ts
import { describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

describe("logger PII redaction", () => {
  it("redacta campos de contacto del caso", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logger.info("caso", { contactoNombre: "Ana", contactoTelefono: "099", contactoEmail: "a@b.c", telefono: "1", email: "x@y.z" });
    const line = spy.mock.calls[0][0] as string;
    expect(line).not.toContain("Ana");
    expect(line).not.toContain("099");
    expect(line).not.toContain("a@b.c");
    spy.mockRestore();
  });
});
```

Run: `cd frontend && pnpm vitest run src/utils/logger.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implementar**

En `frontend/src/utils/logger.ts`:

```ts
const REDACTED_KEYS = [
  "password", "token", "secret", "authorization", "cookie", "apikey", "api_key",
  // Case PII (spec §8): contact data captured by registrar-caso.
  "contacto", "telefono", "email", "brief", "hechos",
];
```

En `backend/src/mastra/common/logger.ts`: revisar el factory `makeLogger` — si `PinoLogger` acepta `redact`/opciones equivalentes, agregar los mismos keys; si no las expone, documentar en el propio archivo que la redacción de payloads de tools queda del lado de Observability (pendiente de configurar) y que NINGÚN log manual debe incluir payloads de tools (regla ya aplicada en el orquestador).

- [ ] **Step 3: Verificar + gates**

Run: `cd frontend && pnpm vitest run && pnpm lint && cd ../backend && pnpm vitest run && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils backend/src/mastra/common/logger.ts
git commit -m "feat: redact case PII keys in structured loggers"
```

---

### Task 16: Evals del receptor — golden set + gate

Hace real `pnpm evals` para el clasificador: matcher programático de tool-calls (sin LLM judge), threshold que falla el proceso.

**Files:**
- Create: `backend/src/test/agents/recepcion/datasets/clasificacion.json`
- Modify: `backend/src/test/run-evals.ts`
- Delete: `backend/src/test/agents/consultas/datasets/.gitkeep` (carpeta `consultas` ya no existe como agente)

- [ ] **Step 1: Dataset**

```json
[
  { "mensaje": "me despidieron ayer sin pagarme la liquidacion", "esperado": { "categoria": "laboral", "subcategoria": "despido" } },
  { "mensaje": "me llego un telegrama de despido, que hago?", "esperado": { "categoria": "laboral", "subcategoria": "despido" } },
  { "mensaje": "hace 3 meses que no me pagan el sueldo completo", "esperado": { "categoria": "laboral" } },
  { "mensaje": "me quiero divorciar, como arranco?", "esperado": { "categoria": "categoria-no-habilitada" } },
  { "mensaje": "mi ex no me deja ver a mis hijos", "esperado": { "categoria": "categoria-no-habilitada" } },
  { "mensaje": "me quieren desalojar del apartamento que alquilo", "esperado": { "categoria": "categoria-no-habilitada" } },
  { "mensaje": "compre una heladera y vino rota, el local no responde", "esperado": { "categoria": "categoria-no-habilitada" } },
  { "mensaje": "cuanto sale un kilo de asado?", "esperado": { "categoria": "fuera-de-universo" } },
  { "mensaje": "necesito ayuda con mi tarea de matematica", "esperado": { "categoria": "fuera-de-universo" } },
  { "mensaje": "mi pareja me pega y tengo miedo de volver a casa", "esperado": { "casoSensible": true } },
  { "mensaje": "hola", "esperado": { "pregunta": true } },
  { "mensaje": "tengo un problema y no se que hacer", "esperado": { "pregunta": true } }
]
```

- [ ] **Step 2: Runner** — reemplazar el skeleton de `backend/src/test/run-evals.ts`:

```ts
/**
 * Receptor classification evals: programmatic tool-call matcher over the
 * golden set (spec §9). Gate: precision >= THRESHOLD or exit 1 — enabling a
 * second category REQUIRES this to pass on an extended dataset.
 * Uses generate() without memory: each item is an isolated first message.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { recepcionAgent } from "../mastra/dominios/recepcion/index.js";

const THRESHOLD = 0.9;

interface EvalItem {
  mensaje: string;
  esperado: { categoria?: string; subcategoria?: string; casoSensible?: boolean; pregunta?: boolean };
}

interface ToolCallInfo {
  toolName: string;
  args: Record<string, unknown>;
}

function extractToolCalls(result: unknown): ToolCallInfo[] {
  const value = result as { toolCalls?: Array<{ toolName?: string; args?: unknown; input?: unknown }> };
  return (value.toolCalls ?? []).flatMap((call) => {
    if (!call.toolName) return [];
    const args = (call.args ?? call.input ?? {}) as Record<string, unknown>;
    return [{ toolName: call.toolName, args }];
  });
}

async function main(): Promise<number> {
  const datasetPath = join(dirname(fileURLToPath(import.meta.url)), "agents/recepcion/datasets/clasificacion.json");
  const items = JSON.parse(readFileSync(datasetPath, "utf8")) as EvalItem[];

  let passed = 0;
  const failures: string[] = [];

  for (const item of items) {
    const result = await recepcionAgent.generate(item.mensaje, {
      requestContext: { threadId: "eval", resourceId: "eval", readOnly: { userId: "eval" } } as never,
    });
    const asignaciones = extractToolCalls(result).filter((c) => c.toolName === "asignar-clasificacion");
    const args = asignaciones[0]?.args;

    let ok = false;
    if (item.esperado.pregunta) {
      ok = asignaciones.length === 0; // must ask, not classify
    } else if (item.esperado.casoSensible) {
      ok = args?.casoSensible === true;
    } else {
      ok =
        args?.categoria === item.esperado.categoria &&
        (item.esperado.subcategoria === undefined || args?.subcategoria === item.esperado.subcategoria);
    }

    if (ok) passed += 1;
    else failures.push(`"${item.mensaje}" → esperado ${JSON.stringify(item.esperado)}, obtuvo ${JSON.stringify(args ?? "sin tool-call")}`);
  }

  const precision = passed / items.length;
  console.log(`Receptor classification: ${passed}/${items.length} (${(precision * 100).toFixed(0)}%) — threshold ${THRESHOLD * 100}%`);
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  return precision >= THRESHOLD ? 0 : 1;
}

main().then((code) => {
  process.exitCode = code;
});
```

(`console.log` permitido: es un script. Si la firma de `generate`/shape de `toolCalls` difiere en la versión instalada, ajustar `extractToolCalls` con lo observado — mismo criterio tolerante del parser SSE.)

- [ ] **Step 3: Correr y calibrar**

Run: `cd backend && pnpm evals`
Expected: exit 0 con precisión ≥ 90%. Si un ítem falla por prompt (no por harness), ajustar `recepcion/instructions.ts` (señales/reglas) y re-correr. Registrar en el commit qué ajuste de prompt exigió el dataset.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test
git commit -m "feat(backend): receptor classification evals with precision gate"
```

---

### Task 17: Actualización de documentación

**Files:**
- Modify: `docs/guia-arquitectura.md` §2.1-2.2 y §3.2/§3.4
- Modify: `docs/dominio-consultas.md` §3
- Modify: `CLAUDE.md` (comando ingest con flags; gotcha de `memory.readOnly` si Task 8 reveló matices)

- [ ] **Step 1: `guia-arquitectura.md`**
  - §2.1: reemplazar "El frontend elige el agente… el backend no deriva identidad ni rutea" por el modelo real: el BFF rutea leyendo `Conversation.categoria`; sin categoría corre el receptor global (readOnly memory); el mapa de agentes lo define `dominios/registry.ts` (categoría = agente principal; receptor global único). Referenciar el spec.
  - §2.2: reescribir la jerarquía: los sub-agentes Networks quedan como **evolución opcional** con criterio de promoción (evals que muestren degradación del prompt del agente de categoría); en v1 el agente de categoría busca el corpus directo con filtro de partición.
  - §3.2: actualizar el flujo del proxy (observador de tool-calls, encadenamiento same-turn, desacople del abort).
- [ ] **Step 2: `dominio-consultas.md` §3** — cerrar la "Nota — tensión a resolver": el ruteo vive en el BFF con clasificación persistida; el clasificador es el receptor global conversacional. Actualizar la sección de implicaciones con "subcategoría = dato del caso, no estado de ruteo".
- [ ] **Step 3: `CLAUDE.md`** — comando `pnpm ingest <archivo> --title "..." --categoria laboral --subcategoria despido`; agregar gotchas nuevos descubiertos en Tasks 8/13 (shape de eventos tool-call, `memory.options.readOnly`).
- [ ] **Step 4: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: align architecture guide and taxonomy with implemented routing model"
```

---

### Task 18: Verificación final end-to-end y cierre

- [ ] **Step 1: Gates completos**

```bash
cd backend && pnpm vitest run && pnpm lint
cd ../frontend && pnpm vitest run && pnpm typecheck && pnpm lint
```
Expected: todo verde.

- [ ] **Step 2: Flujo real completo en el browser** (usar la skill de verificación del harness si está disponible)

Levantar ambos servicios y recorrer en el chat del home:
1. "hola" → el receptor responde con una pregunta empática (slow-path), sin clasificar.
2. "me despidieron ayer sin pagarme nada" → respuesta del agente laboral (mismo chat, sin costura visible). DB: `categoria=laboral`, caso con `subcategorias=[despido]` y evento CLASIFICACION.
3. Seguir la conversación hasta que pida contacto; darlo → `Caso.estado=CAPTADO`, evento CONTACTO, y los logs NO contienen el teléfono/email en claro.
4. Nueva sesión (ventana privada): "me quieren desalojar" → respuesta honesta de no-cobertura + oferta de contacto; DB: caso `FUERA_DE_COBERTURA` con `temaDetectado`.
5. Refrescar la página de la sesión 2 y mandar otro mensaje → sigue el receptor (los escapes no fijan categoría).

- [ ] **Step 3: Evals**

Run: `cd backend && pnpm evals` — Expected: gate verde.

- [ ] **Step 4: Cierre de rama**

Invocar la skill `superpowers:finishing-a-development-branch` (merge/PR según prefiera el usuario — recordar: nunca push directo a `main`).
