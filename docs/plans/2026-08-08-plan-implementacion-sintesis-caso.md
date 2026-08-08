# Síntesis del caso en el board — plan de implementación

> **Para quien ejecute con agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para el seguimiento.

**Goal:** cada `Caso` tiene un resumen generado con IA que el equipo legal lee como pieza central en `/board/casos/[id]`, con el contacto, las notas del equipo y el chat como verificación.

**Architecture:** el backend Mastra expone un apiRoute custom que resume el transcript con `generateObject`; el BFF lo llama a través de una única función idempotente (`asegurarSintesis`) que decide por huella si la síntesis vigente sirve o hay que regenerar, y persiste en una tabla propia `SintesisCaso`. La UI es una ruta nueva del board con el patrón RSC delgado + client component con SWR.

**Tech Stack:** TypeScript ES Modules · Mastra 1.x (`@mastra/core/server`) · AI SDK 6 (`ai`, `@ai-sdk/gateway`) · Next.js 16 App Router · Prisma 6 + Postgres · Zod 4 · vitest.

**Spec:** `docs/plans/2026-08-08-sintesis-caso-board.md`. Ante duda de alcance, manda el spec.

## Global Constraints

- **NUNCA `any`** — `unknown` + Zod. Contratos como schema Zod, tipos con `z.infer`.
- **NUNCA `console.log`** — logger estructurado (`@/utils/logger` en el frontend, `makeLogger` en el backend). Los logs nunca incluyen texto de conversación ni datos de contacto.
- **Degradación graceful**: ninguna falla de la síntesis puede impedir ver el caso, ni romper el stream del chat.
- **Imports por subpath de Mastra** (`@mastra/core/server`), nunca el barrel.
- **Naming**: código en inglés camelCase; identificadores de dominio, archivos y rutas en kebab-case español; prosa user-facing y prompts en español rioplatense.
- **Aislamiento por identidad**: toda query del board pasa por `casosReales()` / `conversacionesReales()` (`frontend/src/lib/board/scope.ts`). Nunca escribir `esRevision` a mano.
- **Rutas custom de Mastra fuera de `/api`** — Mastra rechaza al boot cualquier `apiRoutes` bajo el prefijo built-in.
- **Commits**: conventional commits, en español, uno por tarea, con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Antes de cada commit**: `pnpm lint` y los tests del paquete tocado.
- El trabajo va en el worktree `.claude/worktrees/resumen-caso`, rama `worktree-resumen-caso`.

---

### Task 1: Modelo de datos

**Files:**
- Modify: `frontend/prisma/schema.prisma` (modelo `Caso`, líneas 105-131)
- Create: `frontend/prisma/migrations/<timestamp>_sintesis_y_notas_de_caso/migration.sql` (la genera Prisma)

**Interfaces:**
- Consumes: nada.
- Produces: modelos `SintesisCaso { id, casoId (unique), contenido: Json, huella: String, modelo: String, generadaEn: DateTime, updatedAt: DateTime }` y `NotaCaso { id, casoId, autor: String, texto: String, createdAt: DateTime }`, más las relaciones inversas `Caso.sintesis` y `Caso.notas`.

- [ ] **Step 1: Agregar los modelos al schema**

En `frontend/prisma/schema.prisma`, dentro del modelo `Caso`, agregar las relaciones inversas junto a `eventos`:

```prisma
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  eventos      CasoEvento[]
  sintesis     SintesisCaso?
  notas        NotaCaso[]
```

Y después del modelo `CasoEvento`, agregar:

```prisma
/// Resumen del caso generado con IA sobre el transcript — la pieza que el
/// equipo legal lee primero. Tabla propia y no columnas en `Caso` por dos
/// razones: guardar la síntesis no debe mover `Caso.updatedAt` (es el orden
/// del listado de captados, y entraría en el cálculo de su propia huella), y
/// el ciclo de vida es distinto — la síntesis se regenera y se descarta.
model SintesisCaso {
  id     String @id @default(cuid())
  casoId String @unique
  /// Validado con el schema Zod antes de escribirse — ver lib/casos/sintesis.
  contenido Json
  /// Huella del material resumido: transcript + campos del caso + versión de
  /// prompt y modelo. Igual = la síntesis vigente sirve, no se regenera.
  huella     String
  modelo     String
  generadaEn DateTime @default(now())
  updatedAt  DateTime @updatedAt

  caso Caso @relation(fields: [casoId], references: [id], onDelete: Cascade)
}

/// Nota del equipo legal sobre el caso: información conseguida por fuera del
/// chat, típicamente hablando con el cliente. Append-only. NO es
/// `NotaRevision`: aquello es feedback dirigido al equipo dev y `feedback:pull`
/// levanta toda nota ABIERTA — estas notas no son un pedido de arreglo.
model NotaCaso {
  id     String @id @default(cuid())
  casoId String
  /// Identidad de la sesión del board. Nunca viene del body.
  autor     String
  texto     String
  createdAt DateTime @default(now())

  caso Caso @relation(fields: [casoId], references: [id], onDelete: Cascade)

  @@index([casoId, createdAt])
}
```

- [ ] **Step 2: Generar y aplicar la migración**

```bash
cd frontend && pnpm prisma migrate dev --name sintesis_y_notas_de_caso
```

Esperado: crea la carpeta de migración, aplica sobre la base de `frontend/.env` y regenera el cliente. La migración es **aditiva** (dos tablas nuevas, ninguna columna existente tocada), por eso es segura sobre la base compartida entre worktrees.

Si Prisma reporta drift por tablas del schema `mastra`, **frená y avisá** — no aceptes el reset que propone: borraría la memoria de conversaciones. El schema `mastra` está aislado justamente para eso.

- [ ] **Step 3: Verificar que el cliente tipa los modelos nuevos**

```bash
cd frontend && pnpm typecheck
```

Y una comprobación puntual de que el cliente conoce las tablas:

```bash
cd frontend && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();console.log(typeof p.sintesisCaso.findUnique, typeof p.notaCaso.create)"
```

Esperado: `function function`.

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(board): agrega SintesisCaso y NotaCaso al modelo de datos"
```

---

### Task 2: Schema y prompt de la síntesis (backend)

**Files:**
- Create: `backend/src/mastra/sintesis/schema.ts`
- Create: `backend/src/mastra/sintesis/prompt.ts`
- Create: `backend/src/mastra/sintesis/sintesis.test.ts`
- Modify: `backend/src/mastra/config/modelos.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `sintesisSchema` (Zod) y `type Sintesis = z.infer<typeof sintesisSchema>`
  - `materialSchema` (Zod) y `type MaterialSintesis = z.infer<typeof materialSchema>`
  - `PROMPT_SINTESIS: string`, `PROMPT_VERSION: string`
  - `formatearMaterial(material: MaterialSintesis): string`
  - `MODELO_SINTESIS: string` en `config/modelos.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/mastra/sintesis/sintesis.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { PROMPT_SINTESIS, formatearMaterial } from "./prompt.js";
import { materialSchema, sintesisSchema } from "./schema.js";

describe("sintesisSchema", () => {
  const base = {
    situacion: "Lo despidieron sin causa tras seis años.",
    hechos: [{ cuando: "2026-07-15", que: "Le comunicaron la desvinculación por teléfono." }],
    datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
    pedido: "Quiere saber qué le corresponde cobrar.",
    faltantes: ["Último salario nominal"],
  };

  it("acepta la forma completa", () => {
    expect(sintesisSchema.parse(base).hechos[0]?.cuando).toBe("2026-07-15");
  });

  // Las dos familias del stack dicen "no tengo este dato" distinto: GPT manda
  // null explícito, Gemini omite la clave. Las dos tienen que entrar, o un
  // hecho sin fecha invalida la síntesis entera.
  it("acepta `cuando` en null y `cuando` ausente, y normaliza los dos a null", () => {
    const conNull = sintesisSchema.parse({ ...base, hechos: [{ cuando: null, que: "No recuerda la fecha." }] });
    const sinClave = sintesisSchema.parse({ ...base, hechos: [{ que: "No recuerda la fecha." }] });
    expect(conNull.hechos[0]?.cuando).toBeNull();
    expect(sinClave.hechos[0]?.cuando).toBeNull();
  });

  it("tolera que falten las listas, no que falte la situación", () => {
    expect(sintesisSchema.parse({ situacion: "Algo", pedido: "Algo" }).hechos).toEqual([]);
    expect(sintesisSchema.safeParse({ pedido: "Algo" }).success).toBe(false);
  });
});

describe("PROMPT_SINTESIS", () => {
  // Mismos chequeos que corren sobre rules y skills: la palabra "skill" hace
  // que el modelo intente invocar una herramienta inexistente, y los emojis
  // gastan tokens sin aportar semántica.
  it("no usa la palabra skill ni emojis", () => {
    expect(PROMPT_SINTESIS.toLowerCase()).not.toContain("skill");
    expect(PROMPT_SINTESIS).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("ordena ceñirse al caso y no inventar", () => {
    expect(PROMPT_SINTESIS).toContain("faltantes");
    expect(PROMPT_SINTESIS).toMatch(/solo lo que/i);
  });
});

describe("formatearMaterial", () => {
  const material = materialSchema.parse({
    caso: { categoria: "laboral", subcategorias: ["despido"], estado: "CAPTADO", resumen: "Despido sin causa." },
    mensajes: [
      { rol: "user", texto: "Me echaron ayer" },
      { rol: "assistant", texto: "Lamento escuchar eso" },
    ],
  });

  it("marca quién habla en cada turno y trae los datos del caso", () => {
    const texto = formatearMaterial(material);
    expect(texto).toContain("laboral");
    expect(texto).toContain("despido");
    expect(texto).toContain("Consultante: Me echaron ayer");
    expect(texto).toContain("Asistente: Lamento escuchar eso");
  });

  it("acepta un caso sin categoría (pedido fuera de cobertura)", () => {
    const sinCategoria = materialSchema.parse({
      caso: { categoria: null, subcategorias: [], estado: "FUERA_DE_COBERTURA", resumen: null },
      mensajes: [{ rol: "user", texto: "Tengo un problema de propiedad horizontal" }],
    });
    expect(formatearMaterial(sinCategoria)).toContain("sin categoría asignada");
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd backend && pnpm test src/mastra/sintesis/sintesis.test.ts
```

Esperado: FAIL — no existen `./prompt.js` ni `./schema.js`.

- [ ] **Step 3: Escribir `schema.ts`**

```typescript
import { z } from "zod";

/**
 * Forma de la síntesis. `cuando` acepta null y ausencia porque las dos
 * familias del stack expresan distinto "no tengo este dato" (GPT manda null,
 * Gemini omite la clave) — el mismo gotcha que costó 25 `registrar-caso` en
 * producción. Se normaliza a null para que el consumidor tenga un solo caso.
 *
 * Las listas caen a vacío: una síntesis sin faltantes es legítima, una sin
 * situación no lo es.
 */
export const sintesisSchema = z.object({
  situacion: z.string().min(1),
  hechos: z
    .array(
      z.object({
        cuando: z
          .string()
          .nullish()
          .transform((valor) => valor ?? null),
        que: z.string().min(1),
      }),
    )
    .default([]),
  datosClave: z.array(z.object({ etiqueta: z.string().min(1), valor: z.string().min(1) })).default([]),
  pedido: z.string().min(1),
  faltantes: z.array(z.string().min(1)).default([]),
});

export type Sintesis = z.infer<typeof sintesisSchema>;

/** Lo que el BFF manda para resumir: el caso y su conversación completa. */
export const materialSchema = z.object({
  caso: z.object({
    categoria: z.string().nullable(),
    subcategorias: z.array(z.string()).default([]),
    estado: z.string(),
    /** Lo que los agentes fueron dejando en `Caso.resumen` (brief + hechos). */
    resumen: z.string().nullable(),
  }),
  mensajes: z
    .array(z.object({ rol: z.enum(["user", "assistant"]), texto: z.string() }))
    .min(1),
});

export type MaterialSintesis = z.infer<typeof materialSchema>;
```

- [ ] **Step 4: Escribir `prompt.ts`**

```typescript
import type { MaterialSintesis } from "./schema.js";

/**
 * Entra en la huella del material (`frontend/src/lib/casos/huella.ts`):
 * cambiar el prompt marca stale a todas las síntesis, igual que
 * PIPELINE_VERSION con el corpus. Subila con cada cambio de contenido.
 */
export const PROMPT_VERSION = "1";

export const PROMPT_SINTESIS = `<rol>
Sos quien prepara el legajo de un caso para el equipo legal. Escribís para abogados: preciso, ordenado y sin adornos.
</rol>

<tarea>
Recibís la conversación entre una persona que consulta y el asistente legal que la atendió, más los datos ya registrados del caso. Devolvés un resumen que le permita a un abogado entender la situación completa sin leer la conversación.
</tarea>

<reglas>
Afirmá solo lo que la persona dijo en la conversación. El dato que no aparece va en faltantes: nunca lo completes por verosimilitud, porque el abogado va a tomar como relevado todo lo que escribas.
Escribí en español rioplatense, en prosa clara, sin tecnicismos innecesarios.
Una conversación puede tocar más de un asunto legal. Ceñite al que corresponde a la categoría y las subcategorías del caso que te pasan; lo que pertenece a otro asunto queda afuera.
En situacion dá el panorama en un párrafo: quién es, qué le pasó y en qué punto está. En hechos poné la cronología, un hecho por entrada, con la fecha que haya dicho o null si no la dijo.
En datosClave poné lo que sirve para dimensionar el reclamo, con la etiqueta que corresponda a este caso — por ejemplo antigüedad, salario nominal, fecha del despido, forma de la desvinculación. Solo los que la persona dio.
En pedido escribí qué vino a resolver, con sus palabras traducidas a las de un abogado.
En faltantes poné lo que haría falta preguntarle y la conversación no responde.
Describí el caso y no la conversación: no menciones al asistente, ni al chat, ni cómo se obtuvo cada dato.
Sin emojis.
</reglas>`;

/** El material como texto plano para el prompt de usuario. */
export function formatearMaterial(material: MaterialSintesis): string {
  const { caso, mensajes } = material;
  const encabezado = [
    `Categoría del caso: ${caso.categoria ?? "sin categoría asignada (pedido fuera de cobertura)"}`,
    `Subcategorías: ${caso.subcategorias.join(", ") || "ninguna registrada"}`,
    `Estado: ${caso.estado}`,
    caso.resumen ? `Registrado hasta ahora: ${caso.resumen}` : null,
  ]
    .filter((linea): linea is string => linea !== null)
    .join("\n");

  const conversacion = mensajes
    .map((mensaje) => `${mensaje.rol === "user" ? "Consultante" : "Asistente"}: ${mensaje.texto}`)
    .join("\n\n");

  return `<caso>\n${encabezado}\n</caso>\n\n<conversacion>\n${conversacion}\n</conversacion>`;
}
```

- [ ] **Step 5: Agregar el modelo del rol**

En `backend/src/mastra/config/modelos.ts`, al final:

```typescript
/**
 * Síntesis del caso para el board. El criterio del rol es fidelidad sobre
 * texto ya dado, no razonamiento: el material entero viaja en el prompt y la
 * tarea es reorganizarlo. Corre fuera del camino del chat, así que su latencia
 * no la percibe ningún consultante.
 *
 * Igual que los otros dos, tiene que entrar en `frontend/src/lib/board/costos.ts`
 * o el board reporta su costo como "sin dato".
 */
export const MODELO_SINTESIS = "google/gemini-3.5-flash-lite";
```

- [ ] **Step 6: Correr los tests**

```bash
cd backend && pnpm test src/mastra/sintesis/sintesis.test.ts && pnpm lint
```

Esperado: PASS, sin errores de lint.

- [ ] **Step 7: Commit**

```bash
git add backend/src/mastra/sintesis backend/src/mastra/config/modelos.ts
git commit -m "feat(sintesis): define el contrato y el prompt del resumen de caso"
```

---

### Task 3: Generador y endpoint (backend)

**Files:**
- Create: `backend/src/mastra/sintesis/generar-sintesis.ts`
- Create: `backend/src/mastra/sintesis/generar-sintesis.test.ts`
- Modify: `backend/src/mastra/index.ts:40-48` (`server.apiRoutes`)

**Interfaces:**
- Consumes: `sintesisSchema`, `materialSchema`, `MaterialSintesis`, `PROMPT_SINTESIS`, `formatearMaterial` (Task 2); `MODELO_SINTESIS`.
- Produces:
  - `generarSintesis(material: MaterialSintesis, deps?: { generar?: GenerarObjeto }): Promise<ResultadoSintesis>`
  - `type ResultadoSintesis = { status: "ok"; sintesis: Sintesis; modelo: string } | { status: "error"; mensaje: string }`
  - `POST /sintesis-caso` que recibe `MaterialSintesis` y devuelve `ResultadoSintesis` (HTTP 200 en los dos casos, 400 si el body no valida).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/mastra/sintesis/generar-sintesis.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import { generarSintesis } from "./generar-sintesis.js";
import type { MaterialSintesis } from "./schema.js";

const material: MaterialSintesis = {
  caso: { categoria: "laboral", subcategorias: ["despido"], estado: "CAPTADO", resumen: null },
  mensajes: [{ rol: "user", texto: "Me despidieron sin causa después de seis años" }],
};

const objetoValido = {
  situacion: "Lo despidieron sin causa tras seis años.",
  hechos: [{ cuando: null, que: "Le comunicaron la desvinculación." }],
  datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
  pedido: "Saber qué le corresponde.",
  faltantes: ["Último salario nominal"],
};

describe("generarSintesis", () => {
  it("devuelve la síntesis validada y el modelo que la generó", async () => {
    const generar = vi.fn().mockResolvedValue({ object: objetoValido });
    const resultado = await generarSintesis(material, { generar });

    expect(resultado.status).toBe("ok");
    if (resultado.status !== "ok") return;
    expect(resultado.sintesis.situacion).toBe(objetoValido.situacion);
    expect(resultado.modelo).toContain("gemini");
  });

  it("le pasa al modelo el prompt de sistema y el material formateado", async () => {
    const generar = vi.fn().mockResolvedValue({ object: objetoValido });
    await generarSintesis(material, { generar });

    const argumentos = generar.mock.calls[0]?.[0] as { system: string; prompt: string };
    expect(argumentos.system).toContain("<rol>");
    expect(argumentos.prompt).toContain("Consultante: Me despidieron sin causa");
  });

  // Degradación graceful: el error viaja como valor. Una excepción acá tumbaría
  // el request del board y la vista del caso con él.
  it("degrada a error cuando el modelo falla, sin tirar", async () => {
    const generar = vi.fn().mockRejectedValue(new Error("gateway 503"));
    const resultado = await generarSintesis(material, { generar });

    expect(resultado).toEqual({ status: "error", mensaje: "No se pudo generar la síntesis" });
  });

  it("degrada a error cuando el modelo devuelve algo que no valida", async () => {
    const generar = vi.fn().mockResolvedValue({ object: { pedido: "sin situación" } });
    const resultado = await generarSintesis(material, { generar });

    expect(resultado.status).toBe("error");
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd backend && pnpm test src/mastra/sintesis/generar-sintesis.test.ts
```

Esperado: FAIL — no existe `./generar-sintesis.js`.

- [ ] **Step 3: Escribir el generador**

Crear `backend/src/mastra/sintesis/generar-sintesis.ts`:

```typescript
import { gateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";

import { makeLogger } from "../common/logger.js";
import { MODELO_SINTESIS } from "../config/modelos.js";

import { PROMPT_SINTESIS, formatearMaterial } from "./prompt.js";
import { sintesisSchema, type MaterialSintesis, type Sintesis } from "./schema.js";

const logger = makeLogger("Sintesis");

export type ResultadoSintesis =
  | { status: "ok"; sintesis: Sintesis; modelo: string }
  | { status: "error"; mensaje: string };

/** Inyectable para poder testear sin gateway ni red. */
export type GenerarObjeto = (opciones: {
  model: unknown;
  schema: typeof sintesisSchema;
  system: string;
  prompt: string;
  temperature: number;
  providerOptions: Record<string, unknown>;
}) => Promise<{ object: unknown }>;

/**
 * Resume un caso. Nunca tira: el error viaja como valor, igual que en las
 * tools de agente — una excepción acá tumbaría la vista del caso, y la
 * síntesis es una comodidad, no un requisito de integridad.
 *
 * `temperature: 1` y el orden de proveedor son los knobs de Gemini vía
 * gateway, los mismos que `opcionesDeModelo` resuelve para los agentes. Van
 * escritos acá porque esta llamada no pasa por `crearAgente`: si algún día el
 * rol cambia de familia, este bloque se mueve con él.
 */
export async function generarSintesis(
  material: MaterialSintesis,
  deps?: { generar?: GenerarObjeto },
): Promise<ResultadoSintesis> {
  const generar = deps?.generar ?? (generateObject as unknown as GenerarObjeto);
  try {
    const { object } = await generar({
      model: gateway(MODELO_SINTESIS),
      schema: sintesisSchema,
      system: PROMPT_SINTESIS,
      prompt: formatearMaterial(material),
      temperature: 1,
      providerOptions: { gateway: { order: ["google", "vertex"] } },
    });

    const validado = sintesisSchema.safeParse(object);
    if (!validado.success) {
      // Solo las rutas de Zod, nunca los valores: el objeto trae el relato del
      // consultante.
      logger.warn("síntesis descartada por forma inválida", {
        campos: validado.error.issues.map((issue) => issue.path.join(".")),
      });
      return { status: "error", mensaje: "No se pudo generar la síntesis" };
    }

    return { status: "ok", sintesis: validado.data, modelo: MODELO_SINTESIS };
  } catch (error) {
    logger.error("generación de síntesis falló", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", mensaje: "No se pudo generar la síntesis" };
  }
}
```

- [ ] **Step 4: Correr los tests**

```bash
cd backend && pnpm test src/mastra/sintesis/generar-sintesis.test.ts
```

Esperado: PASS (4 tests).

- [ ] **Step 5: Registrar el endpoint**

En `backend/src/mastra/index.ts`, agregar el import y la ruta dentro de `apiRoutes`, después de `/dominios`:

```typescript
import { generarSintesis } from "./sintesis/generar-sintesis.js";
import { materialSchema } from "./sintesis/schema.js";
```

```typescript
      // Igual que /dominios: fuera del prefijo `/api`, que Mastra rechaza al
      // boot para rutas custom. Lo consume el BFF (`agent-service.ts`), nunca
      // el browser.
      registerApiRoute("/sintesis-caso", {
        method: "POST",
        handler: async (c) => {
          const validado = materialSchema.safeParse(await c.req.json());
          if (!validado.success) {
            return c.json({ status: "error", mensaje: "Material inválido" }, 400);
          }
          return c.json(await generarSintesis(validado.data));
        },
      }),
```

- [ ] **Step 6: Verificar el endpoint contra el server corriendo**

```bash
cd backend && pnpm dev
```

En otra terminal:

```bash
curl -s -X POST http://127.0.0.1:4112/sintesis-caso \
  -H 'Content-Type: application/json' \
  -d '{"caso":{"categoria":"laboral","subcategorias":["despido"],"estado":"CAPTADO","resumen":null},"mensajes":[{"rol":"user","texto":"Me despidieron sin causa el 15 de julio, trabajé 6 años, cobraba 45000 nominal"}]}' | head -40
```

Esperado: `{"status":"ok","sintesis":{...}}` con la antigüedad y el salario en `datosClave`, y el 15 de julio en `hechos`. Verificar también que un body inválido (`-d '{}'`) devuelve 400.

Cortar el `pnpm dev` al terminar.

- [ ] **Step 7: Commit**

```bash
cd backend && pnpm lint && pnpm test
git add backend/src/mastra
git commit -m "feat(sintesis): expone POST /sintesis-caso en el backend Mastra"
```

---

### Task 4: Cliente del backend y precio del modelo (BFF)

**Files:**
- Modify: `frontend/src/lib/agent-service.ts` (al final)
- Create: `frontend/src/lib/casos/sintesis-schema.ts`
- Create: `frontend/src/lib/casos/sintesis-schema.test.ts`
- Modify: `frontend/src/lib/agent-service.test.ts`
- Modify: `frontend/src/lib/board/costos.ts:13-26`

**Interfaces:**
- Consumes: `getMastraBaseUrl()` (ya existe en `agent-service.ts`).
- Produces:
  - `sintesisSchema`, `type Sintesis`, `materialSchema`, `type MaterialSintesis` (espejo del backend, en `lib/casos/sintesis-schema.ts`)
  - `pedirSintesis(material: MaterialSintesis): Promise<{ status: "ok"; sintesis: Sintesis; modelo: string } | { status: "error"; mensaje: string }>` en `agent-service.ts`

- [ ] **Step 1: Escribir el test del schema espejo**

Crear `frontend/src/lib/casos/sintesis-schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { sintesisSchema } from "./sintesis-schema";

describe("sintesisSchema (espejo del backend)", () => {
  const base = {
    situacion: "Lo despidieron sin causa.",
    hechos: [{ cuando: "2026-07-15", que: "Le comunicaron la desvinculación." }],
    datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
    pedido: "Saber qué le corresponde.",
    faltantes: [],
  };

  it("acepta la forma completa", () => {
    expect(sintesisSchema.parse(base).datosClave).toHaveLength(1);
  });

  // Tolerante en los opcionales, estricto en la forma: la respuesta cruza una
  // frontera HTTP y puede venir de cualquiera de las dos familias de modelo.
  it("normaliza `cuando` ausente o null a null", () => {
    expect(sintesisSchema.parse({ ...base, hechos: [{ que: "Sin fecha" }] }).hechos[0]?.cuando).toBeNull();
    expect(sintesisSchema.parse({ ...base, hechos: [{ cuando: null, que: "Sin fecha" }] }).hechos[0]?.cuando).toBeNull();
  });

  it("rechaza una síntesis sin situación", () => {
    expect(sintesisSchema.safeParse({ ...base, situacion: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd frontend && pnpm test:unit run src/lib/casos/sintesis-schema.test.ts
```

Esperado: FAIL — no existe el módulo.

- [ ] **Step 3: Escribir el schema espejo**

Crear `frontend/src/lib/casos/sintesis-schema.ts` (sin `server-only`: lo importa también el componente cliente para tipar):

```typescript
import { z } from "zod";

/**
 * Espejo de `backend/src/mastra/sintesis/schema.ts`. Vive dos veces porque
 * backend y frontend son paquetes pnpm separados, sin workspace que los una —
 * mismo caso que `chat-orchestrator-schemas.ts`, que valida args de tools
 * definidas del otro lado. Regla para que no se desincronicen: tolerante en
 * los opcionales, estricto en la forma, y un cambio de campo toca los dos
 * archivos en el mismo commit.
 */
export const sintesisSchema = z.object({
  situacion: z.string().min(1),
  hechos: z
    .array(
      z.object({
        cuando: z
          .string()
          .nullish()
          .transform((valor) => valor ?? null),
        que: z.string().min(1),
      }),
    )
    .default([]),
  datosClave: z.array(z.object({ etiqueta: z.string().min(1), valor: z.string().min(1) })).default([]),
  pedido: z.string().min(1),
  faltantes: z.array(z.string().min(1)).default([]),
});

export type Sintesis = z.infer<typeof sintesisSchema>;

export const materialSchema = z.object({
  caso: z.object({
    categoria: z.string().nullable(),
    subcategorias: z.array(z.string()),
    estado: z.string(),
    resumen: z.string().nullable(),
  }),
  mensajes: z.array(z.object({ rol: z.enum(["user", "assistant"]), texto: z.string() })).min(1),
});

export type MaterialSintesis = z.infer<typeof materialSchema>;

/** Respuesta del endpoint del backend. */
export const respuestaSintesisSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), sintesis: sintesisSchema, modelo: z.string() }),
  z.object({ status: z.literal("error"), mensaje: z.string() }),
]);
```

- [ ] **Step 4: Escribir el test del cliente**

Agregar a `frontend/src/lib/agent-service.test.ts` (respetando los imports y el estilo del archivo; si el archivo mockea `fetch` global, seguir ese mismo patrón):

```typescript
describe("pedirSintesis", () => {
  const material = {
    caso: { categoria: "laboral", subcategorias: ["despido"], estado: "CAPTADO", resumen: null },
    mensajes: [{ rol: "user" as const, texto: "Me despidieron" }],
  };

  it("postea el material al endpoint del backend y devuelve la síntesis", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          modelo: "google/gemini-3.5-flash-lite",
          sintesis: { situacion: "Despido sin causa.", pedido: "Saber qué cobra.", hechos: [], datosClave: [], faltantes: [] },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await pedirSintesis(material);

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/sintesis-caso");
    expect(resultado.status).toBe("ok");
  });

  // El BFF nunca confía en la forma que cruza la red: un backend viejo o un
  // modelo nuevo pueden devolver algo distinto, y eso no puede escribirse en
  // la base ni romper la vista.
  it("degrada a error si el backend responde con una forma inesperada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    expect((await pedirSintesis(material)).status).toBe("error");
  });

  it("degrada a error si el backend no responde", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect((await pedirSintesis(material)).status).toBe("error");
  });
});
```

- [ ] **Step 5: Implementar el cliente**

Agregar al final de `frontend/src/lib/agent-service.ts`:

```typescript
/**
 * Pide la síntesis de un caso al backend Mastra. Sigue siendo este módulo el
 * único que conoce MASTRA_BASE_URL. Nunca tira: la vista del caso tiene que
 * poder renderizar sin síntesis.
 */
export async function pedirSintesis(
  material: MaterialSintesis,
): Promise<z.infer<typeof respuestaSintesisSchema>> {
  try {
    const response = await fetch(`${getMastraBaseUrl()}/sintesis-caso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(material),
    });
    if (!response.ok) {
      logger.warn("sintesis-caso respondió con error", { status: response.status });
      return { status: "error", mensaje: "No se pudo generar la síntesis" };
    }
    const validado = respuestaSintesisSchema.safeParse(await response.json());
    if (!validado.success) {
      logger.warn("respuesta de sintesis-caso con forma inesperada", {
        campos: validado.error.issues.map((issue) => issue.path.join(".")),
      });
      return { status: "error", mensaje: "No se pudo generar la síntesis" };
    }
    return validado.data;
  } catch (error) {
    logger.error("sintesis-caso no respondió", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: "error", mensaje: "No se pudo generar la síntesis" };
  }
}
```

Agregar arriba los imports que falten: `import { logger } from "@/utils/logger";`, `import { materialSchema... }` — en concreto `import type { MaterialSintesis } from "@/lib/casos/sintesis-schema";`, `import { respuestaSintesisSchema } from "@/lib/casos/sintesis-schema";` y `import type { z } from "zod";`.

- [ ] **Step 6: Agregar el precio del modelo**

En `frontend/src/lib/board/costos.ts`, dentro de `PRECIOS_POR_MILLON`, el rol de síntesis usa `gemini-3.5-flash-lite`, que **ya está en la tabla**. Verificarlo y, si el modelo elegido en la Task 2 fuera otro, agregarlo ahí con su precio y un comentario que lo ate al rol. Dejar constancia en el test:

```typescript
it("conoce el precio del modelo del rol de síntesis", () => {
  // El rol vive en backend/src/mastra/config/modelos.ts (MODELO_SINTESIS).
  expect(estimarCostoUsd("google/gemini-3.5-flash-lite", 1_000_000, 0)).toBeCloseTo(0.3);
});
```

- [ ] **Step 7: Correr los tests**

```bash
cd frontend && pnpm test:unit run src/lib/casos src/lib/agent-service.test.ts src/lib/board/costos.test.ts && pnpm lint && pnpm typecheck
```

Esperado: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(board): agrega el cliente BFF de la síntesis de caso"
```

---

### Task 5: Huella del material

**Files:**
- Create: `frontend/src/lib/casos/huella.ts`
- Create: `frontend/src/lib/casos/huella.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `calcularHuella(entrada: EntradaHuella): string` y `type EntradaHuella = { promptVersion: string; modelo: string; mensajes: { cantidad: number; ultimoId: string | null; ultimaFecha: string | null }; caso: { categoria: string | null; subcategorias: string[]; resumen: unknown; contactoNombre: string | null; contactoTelefono: string | null; contactoEmail: string | null; estado: string } }`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/casos/huella.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { calcularHuella, type EntradaHuella } from "./huella";

const base: EntradaHuella = {
  promptVersion: "1",
  modelo: "google/gemini-3.5-flash-lite",
  mensajes: { cantidad: 4, ultimoId: "msg-4", ultimaFecha: "2026-08-08T10:00:00.000Z" },
  caso: {
    categoria: "laboral",
    subcategorias: ["despido", "rubros-laborales"],
    resumen: { brief: "Despido sin causa", hechos: "6 años de antigüedad" },
    contactoNombre: "Ana",
    contactoTelefono: null,
    contactoEmail: "ana@example.com",
    estado: "CAPTADO",
  },
};

describe("calcularHuella", () => {
  it("es estable para la misma entrada", () => {
    expect(calcularHuella(base)).toBe(calcularHuella(structuredClone(base)));
  });

  // El orden de las subcategorías depende de un Set y del orden en que las
  // mandó el agente. Si moviera la huella, cada turno regeneraría la síntesis
  // sin que haya cambiado nada.
  it("no depende del orden de las subcategorías", () => {
    const invertido = { ...base, caso: { ...base.caso, subcategorias: ["rubros-laborales", "despido"] } };
    expect(calcularHuella(invertido)).toBe(calcularHuella(base));
  });

  it("cambia con un mensaje nuevo", () => {
    const conTurno = { ...base, mensajes: { cantidad: 5, ultimoId: "msg-5", ultimaFecha: "2026-08-08T10:05:00.000Z" } };
    expect(calcularHuella(conTurno)).not.toBe(calcularHuella(base));
  });

  it("cambia con un dato de contacto nuevo", () => {
    const conTelefono = { ...base, caso: { ...base.caso, contactoTelefono: "099111222" } };
    expect(calcularHuella(conTelefono)).not.toBe(calcularHuella(base));
  });

  it("cambia con la versión del prompt y con el modelo", () => {
    expect(calcularHuella({ ...base, promptVersion: "2" })).not.toBe(calcularHuella(base));
    expect(calcularHuella({ ...base, modelo: "otro/modelo" })).not.toBe(calcularHuella(base));
  });

  it("cambia con el resumen crudo que dejaron los agentes", () => {
    const conHechos = { ...base, caso: { ...base.caso, resumen: { brief: "Despido sin causa", hechos: "otra cosa" } } };
    expect(calcularHuella(conHechos)).not.toBe(calcularHuella(base));
  });

  // El caso de regresión del spec §5.1: guardar la síntesis no puede mover la
  // huella, o cada apertura regeneraría para siempre. El diseño lo previene por
  // construcción — `EntradaHuella` no tiene por dónde recibir un timestamp de
  // escritura — y este test lo deja fijado: si alguien agrega `updatedAt` al
  // tipo, deja de compilar acá.
  it("no admite timestamps de escritura en la entrada", () => {
    const claves = Object.keys(base.caso);
    expect(claves).not.toContain("updatedAt");
    expect(claves).not.toContain("actualizadoEn");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd frontend && pnpm test:unit run src/lib/casos/huella.test.ts
```

Esperado: FAIL — no existe `./huella`.

- [ ] **Step 3: Implementar la huella**

Crear `frontend/src/lib/casos/huella.ts`:

```typescript
import "server-only";

import { createHash } from "node:crypto";

export interface EntradaHuella {
  promptVersion: string;
  modelo: string;
  mensajes: { cantidad: number; ultimoId: string | null; ultimaFecha: string | null };
  caso: {
    categoria: string | null;
    subcategorias: string[];
    resumen: unknown;
    contactoNombre: string | null;
    contactoTelefono: string | null;
    contactoEmail: string | null;
    estado: string;
  };
}

/**
 * Huella del material que se resumió. Igual = la síntesis guardada sigue
 * vigente y no hace falta llamar al modelo.
 *
 * Todo lo que entra es CONTENIDO. Deliberadamente NO entra `Caso.updatedAt`:
 * escribir la síntesis toca la fila del caso en algunas de las rutas que la
 * rodean, y una huella que depende de un timestamp que la propia escritura
 * mueve regenera en cada apertura para siempre.
 *
 * Tampoco entran las notas del equipo legal: viven en su propia sección de la
 * vista y no son material del resumen (ver el spec §5.1).
 */
export function calcularHuella(entrada: EntradaHuella): string {
  const estable = {
    promptVersion: entrada.promptVersion,
    modelo: entrada.modelo,
    mensajes: entrada.mensajes,
    caso: {
      ...entrada.caso,
      // El orden viene de un Set y del orden en que las mandó el agente: sin
      // ordenar, la misma información produce huellas distintas.
      subcategorias: [...entrada.caso.subcategorias].sort(),
      resumen: entrada.caso.resumen === null ? null : ordenarClaves(entrada.caso.resumen),
    },
  };
  return createHash("sha256").update(JSON.stringify(estable)).digest("hex");
}

/** JSON.stringify preserva el orden de inserción; sobre un Json de Postgres eso no es estable. */
function ordenarClaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarClaves);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([clave, anidado]) => [clave, ordenarClaves(anidado)]),
    );
  }
  return valor;
}
```

- [ ] **Step 4: Correr el test**

```bash
cd frontend && pnpm test:unit run src/lib/casos/huella.test.ts
```

Esperado: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/casos/huella.ts frontend/src/lib/casos/huella.test.ts
git commit -m "feat(board): calcula la huella del material de la síntesis"
```

---

### Task 6: `asegurarSintesis`

**Files:**
- Create: `frontend/src/lib/casos/sintesis.ts`
- Create: `frontend/src/lib/casos/sintesis.test.ts`

**Interfaces:**
- Consumes: `calcularHuella` (Task 5), `pedirSintesis` (Task 4), `casosReales` (`@/lib/board/scope`), `construirTimeline` (`@/lib/revision/timeline`), `PROMPT_VERSION` — que en el frontend se replica como constante local `PROMPT_VERSION = "1"` en este archivo, con el comentario que la ata al backend.
- Produces:
  - `asegurarSintesis(casoId: string, opciones?: { forzar?: boolean }): Promise<EstadoSintesis>`
  - `type EstadoSintesis = { estado: "ok"; sintesis: Sintesis; generadaEn: string; vigente: boolean } | { estado: "sin-sintesis" } | { estado: "error"; sintesis: Sintesis | null; generadaEn: string | null }`

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/casos/sintesis.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    caso: { findFirst: vi.fn() },
    sintesisCaso: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/agent-service", () => ({ pedirSintesis: vi.fn() }));
vi.mock("@/lib/revision/timeline", () => ({ construirTimeline: vi.fn() }));

import { pedirSintesis } from "@/lib/agent-service";
import { prisma } from "@/lib/prisma";
import { construirTimeline } from "@/lib/revision/timeline";

import { asegurarSintesis } from "./sintesis";

const sintesis = {
  situacion: "Despido sin causa tras seis años.",
  hechos: [],
  datosClave: [],
  pedido: "Saber qué le corresponde.",
  faltantes: [],
};

const timeline = [
  { tipo: "mensaje" as const, id: "m1", rol: "user" as const, texto: "Me despidieron", fecha: "2026-08-08T10:00:00.000Z" },
  { tipo: "mensaje" as const, id: "m2", rol: "assistant" as const, texto: "Contame más", fecha: "2026-08-08T10:01:00.000Z" },
];

function casoConSintesis(huella: string | null) {
  return {
    id: "caso-1",
    categoria: "laboral",
    subcategorias: ["despido"],
    resumen: { brief: "Despido" },
    contactoNombre: "Ana",
    contactoTelefono: null,
    contactoEmail: null,
    estado: "CAPTADO",
    conversation: { threadId: "thread-1" },
    sintesis:
      huella === null
        ? null
        : { contenido: sintesis, huella, modelo: "google/gemini-3.5-flash-lite", generadaEn: new Date("2026-08-08T11:00:00.000Z") },
  };
}

describe("asegurarSintesis", () => {
  beforeEach(() => {
    // resetAllMocks y no clearAllMocks: clear deja viva la cola de
    // mockResolvedValueOnce y se filtra entre tests.
    vi.resetAllMocks();
    vi.mocked(construirTimeline).mockResolvedValue(timeline);
  });

  it("devuelve la síntesis guardada sin llamar al backend cuando la huella coincide", async () => {
    // Primero se genera para conocer la huella vigente de este material.
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(null) as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);
    await asegurarSintesis("caso-1");
    const huellaVigente = vi.mocked(prisma.sintesisCaso.upsert).mock.calls[0]?.[0].create.huella as string;

    vi.resetAllMocks();
    vi.mocked(construirTimeline).mockResolvedValue(timeline);
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(huellaVigente) as never);

    const resultado = await asegurarSintesis("caso-1");

    expect(pedirSintesis).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ estado: "ok", vigente: true });
  });

  it("regenera y persiste cuando la huella no coincide", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis("huella-vieja") as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);

    const resultado = await asegurarSintesis("caso-1");

    expect(pedirSintesis).toHaveBeenCalledTimes(1);
    expect(prisma.sintesisCaso.upsert).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ estado: "ok", vigente: true });
  });

  it("con `forzar` regenera aunque la huella coincida", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis("cualquiera") as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "ok", sintesis, modelo: "google/gemini-3.5-flash-lite" });
    vi.mocked(prisma.sintesisCaso.upsert).mockResolvedValue({} as never);

    await asegurarSintesis("caso-1", { forzar: true });

    expect(pedirSintesis).toHaveBeenCalledTimes(1);
  });

  // La síntesis es una comodidad: un backend caído no puede dejar sin vista al
  // caso, y lo viejo es mejor que nada mientras se marque como desactualizado.
  it("ante un error del backend conserva la síntesis vieja y la marca no vigente", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis("huella-vieja") as never);
    vi.mocked(pedirSintesis).mockResolvedValue({ status: "error", mensaje: "No se pudo generar la síntesis" });

    const resultado = await asegurarSintesis("caso-1");

    expect(prisma.sintesisCaso.upsert).not.toHaveBeenCalled();
    expect(resultado).toMatchObject({ estado: "error" });
    if (resultado.estado !== "error") return;
    expect(resultado.sintesis?.situacion).toBe(sintesis.situacion);
  });

  it("sin caso devuelve sin-sintesis y no llama a nadie", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(null as never);

    expect(await asegurarSintesis("no-existe")).toEqual({ estado: "sin-sintesis" });
    expect(pedirSintesis).not.toHaveBeenCalled();
  });

  it("no resume una conversación sin mensajes", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(casoConSintesis(null) as never);
    vi.mocked(construirTimeline).mockResolvedValue([]);

    expect(await asegurarSintesis("caso-1")).toEqual({ estado: "sin-sintesis" });
    expect(pedirSintesis).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd frontend && pnpm test:unit run src/lib/casos/sintesis.test.ts
```

Esperado: FAIL — no existe `./sintesis`.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/casos/sintesis.ts`:

```typescript
import "server-only";

import { pedirSintesis } from "@/lib/agent-service";
import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";
import { construirTimeline } from "@/lib/revision/timeline";
import { logger } from "@/utils/logger";

import { calcularHuella } from "./huella";
import { sintesisSchema, type Sintesis } from "./sintesis-schema";

/**
 * Espejos de `backend/src/mastra/sintesis/prompt.ts` y `config/modelos.ts`.
 * Los dos entran en la huella, y por eso se replican en vez de leerse del
 * backend: la huella tiene que poder calcularse sin llamar a nadie, que es
 * justamente lo que la hace barata. Cambiarlos allá sin cambiarlos acá deja
 * vigentes síntesis generadas con el prompt o el modelo viejo.
 */
const PROMPT_VERSION = "1";
const MODELO = "google/gemini-3.5-flash-lite";

export type EstadoSintesis =
  | { estado: "ok"; sintesis: Sintesis; generadaEn: string; vigente: boolean }
  | { estado: "sin-sintesis" }
  | { estado: "error"; sintesis: Sintesis | null; generadaEn: string | null };

/**
 * Punto de entrada único de la síntesis, idempotente. Devuelve la guardada si
 * el material no cambió; si cambió (o con `forzar`), la regenera y persiste.
 *
 * Se lo llama desde tres lados —el turno que capta el caso, la vista, y el
 * botón de regenerar— y los tres pasan por acá para que exista un solo lugar
 * donde se decide qué es "estar al día".
 */
export async function asegurarSintesis(
  casoId: string,
  opciones?: { forzar?: boolean },
): Promise<EstadoSintesis> {
  const caso = await prisma.caso.findFirst({
    where: { id: casoId, ...casosReales(null) },
    select: {
      id: true,
      categoria: true,
      subcategorias: true,
      resumen: true,
      contactoNombre: true,
      contactoTelefono: true,
      contactoEmail: true,
      estado: true,
      conversation: { select: { threadId: true } },
      sintesis: { select: { contenido: true, huella: true, modelo: true, generadaEn: true } },
    },
  });
  if (!caso) return { estado: "sin-sintesis" };

  const guardada = leerGuardada(caso.sintesis);

  const timeline = await construirTimeline(caso.conversation.threadId);
  const mensajes = timeline.filter((item) => item.tipo === "mensaje");
  // Sin transcript no hay nada que resumir: llamar al modelo con una
  // conversación vacía solo puede producir una síntesis inventada.
  if (mensajes.length === 0) {
    return guardada
      ? { estado: "ok", sintesis: guardada.contenido, generadaEn: guardada.generadaEn, vigente: false }
      : { estado: "sin-sintesis" };
  }

  const huella = calcularHuella({
    promptVersion: PROMPT_VERSION,
    modelo: MODELO,
    mensajes: {
      cantidad: mensajes.length,
      ultimoId: mensajes[mensajes.length - 1]?.id ?? null,
      ultimaFecha: mensajes[mensajes.length - 1]?.fecha ?? null,
    },
    caso: {
      categoria: caso.categoria,
      subcategorias: caso.subcategorias,
      resumen: caso.resumen,
      contactoNombre: caso.contactoNombre,
      contactoTelefono: caso.contactoTelefono,
      contactoEmail: caso.contactoEmail,
      estado: caso.estado,
    },
  });

  if (guardada && guardada.huella === huella && opciones?.forzar !== true) {
    return { estado: "ok", sintesis: guardada.contenido, generadaEn: guardada.generadaEn, vigente: true };
  }

  const resultado = await pedirSintesis({
    caso: {
      categoria: caso.categoria,
      subcategorias: caso.subcategorias,
      estado: caso.estado,
      resumen: textoDelResumen(caso.resumen),
    },
    mensajes: mensajes.map((mensaje) => ({ rol: mensaje.rol, texto: mensaje.texto })),
  });

  if (resultado.status === "error") {
    // Lo viejo, marcado como desactualizado, es mejor que nada.
    return {
      estado: "error",
      sintesis: guardada?.contenido ?? null,
      generadaEn: guardada?.generadaEn ?? null,
    };
  }

  const generadaEn = new Date();
  await prisma.sintesisCaso.upsert({
    where: { casoId },
    create: { casoId, contenido: resultado.sintesis, huella, modelo: resultado.modelo, generadaEn },
    update: { contenido: resultado.sintesis, huella, modelo: resultado.modelo, generadaEn },
  });

  return { estado: "ok", sintesis: resultado.sintesis, generadaEn: generadaEn.toISOString(), vigente: true };
}

/** El Json de Postgres no está tipado: si no valida, es como no tener síntesis. */
function leerGuardada(
  fila: { contenido: unknown; huella: string; modelo: string; generadaEn: Date } | null,
): { contenido: Sintesis; huella: string; generadaEn: string } | null {
  if (!fila) return null;
  const validado = sintesisSchema.safeParse(fila.contenido);
  if (!validado.success) {
    logger.warn("síntesis guardada con forma inválida, se regenera", {
      campos: validado.error.issues.map((issue) => issue.path.join(".")),
    });
    return null;
  }
  return { contenido: validado.data, huella: fila.huella, generadaEn: fila.generadaEn.toISOString() };
}

/** `Caso.resumen` es `{ brief?, hechos?, temaDetectado? }` — se aplana a texto. */
function textoDelResumen(resumen: unknown): string | null {
  if (typeof resumen === "string") return resumen;
  if (resumen === null || typeof resumen !== "object") return null;
  const campos = resumen as Record<string, unknown>;
  const partes = ["brief", "temaDetectado", "hechos"]
    .map((clave) => campos[clave])
    .filter((valor): valor is string => typeof valor === "string" && valor.trim() !== "");
  return partes.length === 0 ? null : partes.join("\n");
}
```

- [ ] **Step 4: Correr el test**

```bash
cd frontend && pnpm test:unit run src/lib/casos/sintesis.test.ts && pnpm lint && pnpm typecheck
```

Esperado: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/casos
git commit -m "feat(board): asegura la síntesis del caso con refresco por huella"
```

---

### Task 7: Detalle del caso y notas

**Files:**
- Create: `frontend/src/lib/casos/caso-detalle.ts`
- Create: `frontend/src/lib/casos/caso-detalle.test.ts`
- Create: `frontend/src/lib/casos/notas-caso.ts`
- Create: `frontend/src/lib/casos/notas-caso.test.ts`
- Modify: `frontend/src/lib/validations/board.ts`

**Interfaces:**
- Consumes: `asegurarSintesis`, `EstadoSintesis` (Task 6); `casosReales` (`@/lib/board/scope`).
- Produces:
  - `obtenerCaso(casoId: string): Promise<DetalleCaso | null>`
  - `interface DetalleCaso { id: string; conversationId: string; categoria: string | null; subcategorias: string[]; estado: string; contactoNombre: string | null; contactoTelefono: string | null; contactoEmail: string | null; creadoEn: string; actualizadoEn: string; sintesis: EstadoSintesis; notas: NotaCasoVista[] }`
  - `interface NotaCasoVista { id: string; autor: string; texto: string; createdAt: string }`
  - `crearNotaCaso(params: { casoId: string; autor: string; texto: string }): Promise<NotaCasoVista | null>`
  - `crearNotaCasoSchema` en `validations/board.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `frontend/src/lib/casos/notas-caso.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { caso: { findFirst: vi.fn() }, notaCaso: { create: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";

import { crearNotaCaso } from "./notas-caso";

describe("crearNotaCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("crea la nota sobre un caso real y devuelve su vista", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue({ id: "caso-1" } as never);
    vi.mocked(prisma.notaCaso.create).mockResolvedValue({
      id: "nota-1",
      autor: "ana@estudio.uy",
      texto: "Habló por teléfono: tiene el telegrama.",
      createdAt: new Date("2026-08-08T12:00:00.000Z"),
    } as never);

    const nota = await crearNotaCaso({ casoId: "caso-1", autor: "ana@estudio.uy", texto: "Habló por teléfono: tiene el telegrama." });

    expect(nota).toMatchObject({ id: "nota-1", autor: "ana@estudio.uy" });
    expect(nota?.createdAt).toBe("2026-08-08T12:00:00.000Z");
  });

  // Mismo guard que el resto del board: una nota sobre un caso de /revision o
  // del runner de escenarios sería una anotación sobre datos de prueba.
  it("devuelve null si el caso no existe o es de una sesión de revisión", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(null as never);

    expect(await crearNotaCaso({ casoId: "caso-x", autor: "ana@estudio.uy", texto: "algo" })).toBeNull();
    expect(prisma.notaCaso.create).not.toHaveBeenCalled();
  });
});
```

Crear `frontend/src/lib/casos/caso-detalle.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { caso: { findFirst: vi.fn() } },
}));
vi.mock("./sintesis", () => ({ asegurarSintesis: vi.fn() }));

import { prisma } from "@/lib/prisma";

import { obtenerCaso } from "./caso-detalle";
import { asegurarSintesis } from "./sintesis";

const fila = {
  id: "caso-1",
  conversationId: "conv-1",
  categoria: "laboral",
  subcategorias: ["despido"],
  estado: "CAPTADO",
  contactoNombre: "Ana",
  contactoTelefono: "099111222",
  contactoEmail: null,
  createdAt: new Date("2026-08-01T10:00:00.000Z"),
  updatedAt: new Date("2026-08-08T10:00:00.000Z"),
  notas: [
    { id: "nota-1", autor: "ana@estudio.uy", texto: "Tiene el telegrama.", createdAt: new Date("2026-08-08T12:00:00.000Z") },
  ],
};

describe("obtenerCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("devuelve el caso con contacto, fechas, notas y síntesis", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "sin-sintesis" });

    const detalle = await obtenerCaso("caso-1");

    expect(detalle).toMatchObject({ id: "caso-1", conversationId: "conv-1", contactoNombre: "Ana" });
    expect(detalle?.notas[0]?.texto).toBe("Tiene el telegrama.");
    expect(detalle?.creadoEn).toBe("2026-08-01T10:00:00.000Z");
  });

  // Una falla de la síntesis no puede impedir ver el caso: el contacto es lo
  // único accionable y tiene que llegar igual.
  it("devuelve el caso aunque la síntesis falle", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(fila as never);
    vi.mocked(asegurarSintesis).mockResolvedValue({ estado: "error", sintesis: null, generadaEn: null });

    const detalle = await obtenerCaso("caso-1");

    expect(detalle?.contactoTelefono).toBe("099111222");
    expect(detalle?.sintesis.estado).toBe("error");
  });

  it("devuelve null para un caso inexistente o de sesión de revisión", async () => {
    vi.mocked(prisma.caso.findFirst).mockResolvedValue(null as never);

    expect(await obtenerCaso("caso-x")).toBeNull();
    expect(asegurarSintesis).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd frontend && pnpm test:unit run src/lib/casos
```

Esperado: FAIL — no existen `./notas-caso` ni `./caso-detalle`.

- [ ] **Step 3: Implementar las notas**

Crear `frontend/src/lib/casos/notas-caso.ts`:

```typescript
import "server-only";

import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";

export interface NotaCasoVista {
  id: string;
  autor: string;
  texto: string;
  createdAt: string;
}

/**
 * Nota del equipo legal sobre el caso — típicamente lo que consiguió hablando
 * con el cliente. El autor lo resuelve el llamador desde la sesión del board,
 * nunca viene del body.
 *
 * Devuelve null cuando el caso no existe o pertenece a una sesión de revisión:
 * mismo guard que el resto del board, para no anotar datos de prueba.
 */
export async function crearNotaCaso(params: {
  casoId: string;
  autor: string;
  texto: string;
}): Promise<NotaCasoVista | null> {
  const caso = await prisma.caso.findFirst({
    where: { id: params.casoId, ...casosReales(null) },
    select: { id: true },
  });
  if (!caso) return null;

  const nota = await prisma.notaCaso.create({
    data: { casoId: caso.id, autor: params.autor, texto: params.texto },
    select: { id: true, autor: true, texto: true, createdAt: true },
  });
  return { ...nota, createdAt: nota.createdAt.toISOString() };
}
```

- [ ] **Step 4: Implementar el detalle**

Crear `frontend/src/lib/casos/caso-detalle.ts`:

```typescript
import "server-only";

import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";

import type { NotaCasoVista } from "./notas-caso";
import { asegurarSintesis, type EstadoSintesis } from "./sintesis";

export interface DetalleCaso {
  id: string;
  conversationId: string;
  categoria: string | null;
  subcategorias: string[];
  estado: string;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  creadoEn: string;
  actualizadoEn: string;
  sintesis: EstadoSintesis;
  notas: NotaCasoVista[];
}

/**
 * El caso como lo ve el equipo legal: la síntesis al centro, el contacto para
 * accionar y las notas del equipo. El enlace al chat lo arma la UI con
 * `conversationId` — el transcript sigue viviendo en /board/chats.
 */
export async function obtenerCaso(casoId: string): Promise<DetalleCaso | null> {
  const caso = await prisma.caso.findFirst({
    where: { id: casoId, ...casosReales(null) },
    select: {
      id: true,
      conversationId: true,
      categoria: true,
      subcategorias: true,
      estado: true,
      contactoNombre: true,
      contactoTelefono: true,
      contactoEmail: true,
      createdAt: true,
      updatedAt: true,
      notas: {
        orderBy: { createdAt: "desc" },
        select: { id: true, autor: true, texto: true, createdAt: true },
      },
    },
  });
  if (!caso) return null;

  // Va después de tener el caso y con su error ya absorbido por
  // `asegurarSintesis`: la vista tiene que renderizar aunque el resumen falle.
  const sintesis = await asegurarSintesis(caso.id);

  return {
    id: caso.id,
    conversationId: caso.conversationId,
    categoria: caso.categoria,
    subcategorias: caso.subcategorias,
    estado: caso.estado,
    contactoNombre: caso.contactoNombre,
    contactoTelefono: caso.contactoTelefono,
    contactoEmail: caso.contactoEmail,
    creadoEn: caso.createdAt.toISOString(),
    actualizadoEn: caso.updatedAt.toISOString(),
    sintesis,
    notas: caso.notas.map((nota) => ({ ...nota, createdAt: nota.createdAt.toISOString() })),
  };
}
```

- [ ] **Step 5: Agregar el schema de validación**

En `frontend/src/lib/validations/board.ts`:

```typescript
/** Nota del equipo legal sobre un caso. El autor sale de la sesión, no del body. */
export const crearNotaCasoSchema = z.object({
  texto: z.string().min(1).max(4000),
});
```

- [ ] **Step 6: Correr los tests**

```bash
cd frontend && pnpm test:unit run src/lib/casos && pnpm lint && pnpm typecheck
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(board): arma el detalle del caso y sus notas"
```

---

### Task 8: Rutas API del board

**Files:**
- Create: `frontend/src/app/api/board/casos/[id]/route.ts`
- Create: `frontend/src/app/api/board/casos/[id]/route.test.ts`
- Create: `frontend/src/app/api/board/casos/[id]/sintesis/route.ts`
- Create: `frontend/src/app/api/board/casos/[id]/notas/route.ts`
- Create: `frontend/src/app/api/board/casos/[id]/notas/route.test.ts`

**Interfaces:**
- Consumes: `obtenerCaso`, `crearNotaCaso` (Task 7), `asegurarSintesis` (Task 6), `crearNotaCasoSchema` (Task 7), `auth` (`@/auth`), `parseRequestBody` (`@/lib/validations`).
- Produces:
  - `GET /api/board/casos/[id]` → `DetalleCaso` · 401 · 404 · 500
  - `POST /api/board/casos/[id]/sintesis` → `{ sintesis: EstadoSintesis }` · 401 · 404 · 500
  - `POST /api/board/casos/[id]/notas` → `{ nota: NotaCasoVista }` 201 · 400 · 401 · 404 · 500

- [ ] **Step 1: Escribir los tests que fallan**

Crear `frontend/src/app/api/board/casos/[id]/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/casos/caso-detalle", () => ({ obtenerCaso: vi.fn() }));

import { auth } from "@/auth";
import { obtenerCaso } from "@/lib/casos/caso-detalle";

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "caso-1" }) };

describe("GET /api/board/casos/[id]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("401 sin sesión, sin tocar la base", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const response = await GET(new Request("http://test/api/board/casos/caso-1"), params);

    expect(response.status).toBe(401);
    expect(obtenerCaso).not.toHaveBeenCalled();
  });

  it("devuelve el detalle del caso", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(obtenerCaso).mockResolvedValue({ id: "caso-1" } as never);

    const response = await GET(new Request("http://test/api/board/casos/caso-1"), params);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "caso-1" });
  });

  it("404 para un caso inexistente", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(obtenerCaso).mockResolvedValue(null);

    expect((await GET(new Request("http://test/api/board/casos/caso-x"), params)).status).toBe(404);
  });

  it("500 genérico sin filtrar el detalle del error", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(obtenerCaso).mockRejectedValue(new Error("connection refused a postgres://usuario:clave@host"));

    const response = await GET(new Request("http://test/api/board/casos/caso-1"), params);

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("postgres://");
  });
});
```

Crear `frontend/src/app/api/board/casos/[id]/notas/route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/casos/notas-caso", () => ({ crearNotaCaso: vi.fn() }));

import { auth } from "@/auth";
import { crearNotaCaso } from "@/lib/casos/notas-caso";

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "caso-1" }) };

function pedido(body: unknown): Request {
  return new Request("http://test/api/board/casos/caso-1/notas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/board/casos/[id]/notas", () => {
  beforeEach(() => vi.resetAllMocks());

  it("401 sin sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    expect((await POST(pedido({ texto: "algo" }), params)).status).toBe(401);
    expect(crearNotaCaso).not.toHaveBeenCalled();
  });

  // El autor es identidad, no dato de entrada: aceptarlo del body dejaría que
  // cualquiera firme una nota con el nombre de otro.
  it("el autor sale de la sesión y no del body", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(crearNotaCaso).mockResolvedValue({ id: "nota-1", autor: "ana@estudio.uy", texto: "algo", createdAt: "2026-08-08T12:00:00.000Z" });

    const response = await POST(pedido({ texto: "algo", autor: "otro@estudio.uy" }), params);

    expect(response.status).toBe(201);
    expect(vi.mocked(crearNotaCaso).mock.calls[0]?.[0].autor).toBe("ana@estudio.uy");
  });

  it("400 con texto vacío", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);

    expect((await POST(pedido({ texto: "" }), params)).status).toBe(400);
    expect(crearNotaCaso).not.toHaveBeenCalled();
  });

  it("404 cuando el caso no existe o es de revisión", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "ana@estudio.uy" } } as never);
    vi.mocked(crearNotaCaso).mockResolvedValue(null);

    expect((await POST(pedido({ texto: "algo" }), params)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd frontend && pnpm test:unit run src/app/api/board/casos
```

Esperado: FAIL — no existen las rutas.

- [ ] **Step 3: Implementar `GET /api/board/casos/[id]`**

Crear `frontend/src/app/api/board/casos/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { obtenerCaso } from "@/lib/casos/caso-detalle";
import { logger } from "@/utils/logger";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const caso = await obtenerCaso(id);
    if (!caso) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json(caso);
  } catch (error) {
    logger.error("board/casos/[id] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Implementar `POST .../sintesis`**

Crear `frontend/src/app/api/board/casos/[id]/sintesis/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { asegurarSintesis } from "@/lib/casos/sintesis";
import { logger } from "@/utils/logger";

/** Regenerar a pedido: `forzar` ignora la huella y vuelve a llamar al modelo. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    if (!sesion?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id } = await params;
    const sintesis = await asegurarSintesis(id, { forzar: true });
    if (sintesis.estado === "sin-sintesis") {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ sintesis });
  } catch (error) {
    logger.error("board/casos/[id]/sintesis POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Implementar `POST .../notas`**

Crear `frontend/src/app/api/board/casos/[id]/notas/route.ts`:

```typescript
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { crearNotaCaso } from "@/lib/casos/notas-caso";
import { crearNotaCasoSchema, parseRequestBody } from "@/lib/validations";
import { logger } from "@/utils/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await auth();
    const autor = sesion?.user?.name?.trim() || sesion?.user?.email?.trim();
    if (!autor) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const validation = await parseRequestBody(request, crearNotaCasoSchema);
    if (!validation.success) return validation.response;

    const { id } = await params;
    // El autor es identidad de la sesión: un `autor` en el body se ignora.
    const nota = await crearNotaCaso({ casoId: id, autor, texto: validation.data.texto });
    if (!nota) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json({ nota }, { status: 201 });
  } catch (error) {
    logger.error("board/casos/[id]/notas POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Ocurrió un error" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Correr los tests**

```bash
cd frontend && pnpm test:unit run src/app/api/board/casos && pnpm lint && pnpm typecheck
```

Esperado: PASS (8 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/board/casos
git commit -m "feat(board): expone las rutas del caso, su síntesis y sus notas"
```

---

### Task 9: Vista `/board/casos/[id]`

**Files:**
- Create: `frontend/src/app/board/casos/[id]/page.tsx`
- Create: `frontend/src/components/board/Casos/DetalleCaso.tsx`
- Create: `frontend/src/components/board/Casos/casos.module.css`
- Create: `frontend/src/components/board/Casos/DetalleCaso.test.tsx`

**Interfaces:**
- Consumes: `DetalleCaso` (tipo, Task 7), `GET /api/board/casos/[id]`, `POST .../sintesis`, `POST .../notas` (Task 8).
- Produces: componente `DetalleCaso({ id }: { id: string })`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/components/board/Casos/DetalleCaso.test.tsx` (seguir el patrón de `components/board/Chats/DetalleChat.test.tsx` para el mock de SWR/fetch; el esqueleto abajo asume mock de `fetch` global como ahí):

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DetalleCaso } from "./DetalleCaso";

const caso = {
  id: "caso-1",
  conversationId: "conv-1",
  categoria: "laboral",
  subcategorias: ["despido"],
  estado: "CAPTADO",
  contactoNombre: "Ana Pérez",
  contactoTelefono: "099111222",
  contactoEmail: "ana@example.com",
  creadoEn: "2026-08-01T10:00:00.000Z",
  actualizadoEn: "2026-08-08T10:00:00.000Z",
  sintesis: {
    estado: "ok",
    vigente: true,
    generadaEn: "2026-08-08T11:00:00.000Z",
    sintesis: {
      situacion: "La despidieron sin causa tras seis años.",
      hechos: [{ cuando: "2026-07-15", que: "Le comunicaron la desvinculación." }],
      datosClave: [{ etiqueta: "Antigüedad", valor: "6 años" }],
      pedido: "Saber qué le corresponde cobrar.",
      faltantes: ["Último salario nominal"],
    },
  },
  notas: [{ id: "nota-1", autor: "ana@estudio.uy", texto: "Tiene el telegrama.", createdAt: "2026-08-08T12:00:00.000Z" }],
};

function responderCon(cuerpo: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: 200 })));
}

describe("DetalleCaso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("muestra el resumen, el contacto y el enlace al chat", async () => {
    responderCon(caso);
    render(<DetalleCaso id="caso-1" />);

    expect(await screen.findByText(/La despidieron sin causa/)).toBeInTheDocument();
    expect(screen.getByText("6 años")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver chat/i })).toHaveAttribute("href", "/board/chats/conv-1");
  });

  it("muestra las notas del equipo legal con su autor", async () => {
    responderCon(caso);
    render(<DetalleCaso id="caso-1" />);

    expect(await screen.findByText("Tiene el telegrama.")).toBeInTheDocument();
    expect(screen.getByText(/ana@estudio.uy/)).toBeInTheDocument();
  });

  // El contacto es lo único accionable: tiene que llegar aunque el resumen no.
  it("renderiza el caso con un aviso cuando la síntesis falló", async () => {
    responderCon({ ...caso, sintesis: { estado: "error", sintesis: null, generadaEn: null } });
    render(<DetalleCaso id="caso-1" />);

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/no pudimos generar/i);
  });

  it("avisa cuando la síntesis quedó desactualizada", async () => {
    responderCon({ ...caso, sintesis: { ...caso.sintesis, vigente: false } });
    render(<DetalleCaso id="caso-1" />);

    expect(await screen.findByText(/desactualizad/i)).toBeInTheDocument();
  });

  it("muestra un error si el caso no carga", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    render(<DetalleCaso id="caso-x" />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd frontend && pnpm test:unit run src/components/board/Casos
```

Esperado: FAIL — no existe el componente.

- [ ] **Step 3: Escribir la página**

Crear `frontend/src/app/board/casos/[id]/page.tsx`:

```tsx
import { DetalleCaso } from "@/components/board/Casos/DetalleCaso";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalleCaso id={id} />;
}
```

- [ ] **Step 4: Escribir el componente**

Crear `frontend/src/components/board/Casos/DetalleCaso.tsx`. Estructura obligatoria, de arriba abajo: encabezado (categoría, subcategorías, estado, fechas), **el resumen como bloque principal**, contacto, notas, enlace al chat.

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import type { DetalleCaso as Caso } from "@/lib/casos/caso-detalle";

import styles from "./casos.module.css";

async function traer(url: string): Promise<Caso> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No pudimos cargar el caso");
  return (await response.json()) as Caso;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DetalleCaso({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/board/casos/${id}`, traer);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);

  const agregarNota = async () => {
    if (texto.trim() === "") return;
    setGuardando(true);
    try {
      const response = await fetch(`/api/board/casos/${id}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (response.ok) {
        setTexto("");
        await mutate();
      }
    } catch {
      // El botón se rehabilita en el finally: sin él queda muerto y se pierde
      // lo tipeado.
    } finally {
      setGuardando(false);
    }
  };

  const regenerar = async () => {
    setRegenerando(true);
    try {
      await fetch(`/api/board/casos/${id}/sintesis`, { method: "POST" });
      await mutate();
    } catch {
      /* el estado del resumen ya lo cuenta la vista */
    } finally {
      setRegenerando(false);
    }
  };

  if (error) return <p role="alert" className={styles.error}>No pudimos cargar el caso.</p>;
  if (isLoading || !data) return <p className={styles.cargando}>Cargando…</p>;

  const sintesis = data.sintesis.estado === "sin-sintesis" ? null : data.sintesis.sintesis;
  const desactualizada = data.sintesis.estado === "error" || (data.sintesis.estado === "ok" && !data.sintesis.vigente);

  return (
    <section className={styles.caso}>
      <header className={styles.encabezado}>
        <Link href="/board" className={styles.link}>← Métricas</Link>
        <h1 className={styles.titulo}>{data.categoria ?? "Pedido fuera de cobertura"}</h1>
        <p className={styles.etiqueta}>
          {data.subcategorias.join(" · ") || "sin subcategorías"} — {data.estado.replace(/_/g, " ").toLowerCase()}
        </p>
        <p className={styles.etiqueta}>
          Abierto el {fecha(data.creadoEn)} · última actividad {fecha(data.actualizadoEn)}
        </p>
      </header>

      <section className={styles.resumen} aria-labelledby="caso-resumen">
        <div className={styles.filaTitulo}>
          <h2 className={styles.subtitulo} id="caso-resumen">Resumen del caso</h2>
          <button type="button" className={styles.boton} onClick={regenerar} disabled={regenerando}>
            {regenerando ? "Regenerando…" : "Regenerar"}
          </button>
        </div>

        {data.sintesis.estado === "error" ? (
          <p role="status" className={styles.aviso}>
            No pudimos generar el resumen. {sintesis ? "Abajo está el último que se generó." : "Podés reintentar o leer el chat."}
          </p>
        ) : desactualizada ? (
          <p role="status" className={styles.aviso}>
            El resumen quedó desactualizado respecto de la conversación.
          </p>
        ) : null}

        {sintesis === null ? (
          <p className={styles.etiqueta}>Todavía no hay resumen de este caso.</p>
        ) : (
          <>
            <p className={styles.situacion}>{sintesis.situacion}</p>

            {sintesis.hechos.length > 0 ? (
              <>
                <h3 className={styles.tituloBloque}>Qué pasó</h3>
                <ul className={styles.hechos}>
                  {sintesis.hechos.map((hecho, indice) => (
                    <li key={`${hecho.que}-${String(indice)}`}>
                      {hecho.cuando ? <span className={styles.fecha}>{hecho.cuando}</span> : null}
                      <span>{hecho.que}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {sintesis.datosClave.length > 0 ? (
              <>
                <h3 className={styles.tituloBloque}>Datos del caso</h3>
                <dl className={styles.datos}>
                  {sintesis.datosClave.map((dato) => (
                    <div key={dato.etiqueta}>
                      <dt>{dato.etiqueta}</dt>
                      <dd>{dato.valor}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            <h3 className={styles.tituloBloque}>Qué pide</h3>
            <p>{sintesis.pedido}</p>

            {sintesis.faltantes.length > 0 ? (
              <>
                <h3 className={styles.tituloBloque}>Falta averiguar</h3>
                <ul className={styles.faltantes}>
                  {sintesis.faltantes.map((faltante) => (
                    <li key={faltante}>{faltante}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {data.sintesis.estado !== "sin-sintesis" && data.sintesis.generadaEn ? (
              <p className={styles.etiqueta}>Generado el {fecha(data.sintesis.generadaEn)}</p>
            ) : null}
          </>
        )}
      </section>

      <section className={styles.bloque} aria-labelledby="caso-contacto">
        <h2 className={styles.subtitulo} id="caso-contacto">Contacto</h2>
        <dl className={styles.datos}>
          <div>
            <dt>Nombre</dt>
            <dd>{data.contactoNombre ?? "—"}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd>{data.contactoTelefono ? <a href={`tel:${data.contactoTelefono}`}>{data.contactoTelefono}</a> : "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{data.contactoEmail ? <a href={`mailto:${data.contactoEmail}`}>{data.contactoEmail}</a> : "—"}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.bloque} aria-labelledby="caso-notas">
        <h2 className={styles.subtitulo} id="caso-notas">Notas del equipo legal</h2>
        <p className={styles.ayuda}>
          Lo que averiguaron por fuera del chat — por ejemplo hablando con la persona.
        </p>
        <div className={styles.composer}>
          <label className={styles.etiqueta} htmlFor="nota-caso">Nueva nota</label>
          <textarea
            id="nota-caso"
            className={styles.textarea}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            rows={3}
          />
          <button type="button" className={styles.boton} onClick={agregarNota} disabled={guardando || texto.trim() === ""}>
            {guardando ? "Guardando…" : "Agregar nota"}
          </button>
        </div>
        {data.notas.length === 0 ? (
          <p className={styles.etiqueta}>Todavía no hay notas sobre este caso.</p>
        ) : (
          <ul className={styles.notas}>
            {data.notas.map((nota) => (
              <li key={nota.id} className={styles.nota}>
                <p className={styles.etiqueta}>{nota.autor} · {fecha(nota.createdAt)}</p>
                <p>{nota.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={styles.verificacion}>
        <Link href={`/board/chats/${data.conversationId}`} className={styles.link}>
          Ver chat completo
        </Link>{" "}
        — para verificar cualquier dato del resumen contra lo que dijo la persona.
      </p>
    </section>
  );
}
```

- [ ] **Step 5: Escribir el CSS**

Crear `frontend/src/components/board/Casos/casos.module.css` copiando las variables y el tono de `components/board/Chats/chats.module.css` (mismo sistema visual del board). Clases necesarias: `caso`, `encabezado`, `titulo`, `subtitulo`, `tituloBloque`, `etiqueta`, `ayuda`, `link`, `boton`, `bloque`, `resumen`, `situacion`, `hechos`, `faltantes`, `datos`, `fecha`, `filaTitulo`, `aviso`, `composer`, `textarea`, `notas`, `nota`, `verificacion`, `error`, `cargando`.

`resumen` es el bloque protagónico: fondo propio, más padding que `bloque` y `situacion` con tamaño de fuente mayor que el cuerpo. No usar `overflow-x` en contenedores con hijos `position: sticky` (gotcha del board).

- [ ] **Step 6: Correr los tests**

```bash
cd frontend && pnpm test:unit run src/components/board/Casos && pnpm lint && pnpm typecheck
```

Esperado: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/board/casos frontend/src/components/board/Casos
git commit -m "feat(board): agrega la vista del caso con el resumen al centro"
```

---

### Task 10: "Ver caso" en el listado de métricas

**Files:**
- Modify: `frontend/src/lib/board/captados.ts:10-16,38-79`
- Modify: `frontend/src/lib/board/captados.test.ts`
- Modify: `frontend/src/lib/board/metricas-funnel.ts:26-30,92-111`
- Modify: `frontend/src/lib/board/metricas-funnel.test.ts`
- Modify: `frontend/src/components/board/Metricas/MetricasPanel.tsx:132-157,232-245`
- Modify: `frontend/src/components/board/Metricas/MetricasPanel.test.tsx`

**Interfaces:**
- Consumes: la tabla `SintesisCaso` (Task 1), `Sintesis` (Task 4).
- Produces:
  - `CasoCaptado` gana `id: string` y `situacion: string | null`
  - `PedidoFueraDeCobertura` gana `casoId: string`

- [ ] **Step 1: Escribir los tests que fallan**

En `frontend/src/lib/board/captados.test.ts`, agregar:

```typescript
it("expone el id del caso y las primeras líneas del resumen", async () => {
  // Ajustar el mock de prisma al patrón que ya usa el archivo.
  const captados = await listarCaptados(null);
  expect(captados[0]?.id).toBe("caso-1");
  expect(captados[0]?.situacion).toBe("La despidieron sin causa tras seis años.");
});

// El listado sirve lo que hay: generar hasta cien síntesis dentro de la carga
// de métricas convertiría el board en un cuello de botella.
it("deja la situación en null cuando el caso todavía no tiene síntesis", async () => {
  const captados = await listarCaptados(null);
  expect(captados[1]?.situacion).toBeNull();
});
```

En `frontend/src/lib/board/metricas-funnel.test.ts`, agregar:

```typescript
it("expone el id del caso de cada pedido fuera de cobertura", async () => {
  const demanda = await calcularDemanda(null);
  // Dos pedidos de la MISMA conversación: por diseño cada tema no cubierto es
  // una fila propia, así que conversationId no identifica la fila.
  expect(demanda.fueraDeCobertura.map((pedido) => pedido.casoId)).toEqual(["caso-1", "caso-2"]);
});
```

En `frontend/src/components/board/Metricas/MetricasPanel.test.tsx`, agregar:

```tsx
it("enlaza cada caso captado a su vista de caso", async () => {
  // Con el mock de métricas del archivo, extendido con id y situacion.
  render(<MetricasPanel />);
  const enlace = await screen.findByRole("link", { name: /ver caso/i });
  expect(enlace).toHaveAttribute("href", "/board/casos/caso-1");
});

it("muestra el resumen de cada caso captado en el listado", async () => {
  render(<MetricasPanel />);
  expect(await screen.findByText(/La despidieron sin causa/)).toBeInTheDocument();
});

it("enlaza cada pedido fuera de cobertura a su caso", async () => {
  render(<MetricasPanel />);
  const enlaces = await screen.findAllByRole("link", { name: /ver caso/i });
  expect(enlaces.some((enlace) => enlace.getAttribute("href") === "/board/casos/caso-2")).toBe(true);
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd frontend && pnpm test:unit run src/lib/board/captados.test.ts src/lib/board/metricas-funnel.test.ts src/components/board/Metricas
```

Esperado: FAIL — `id`, `situacion` y `casoId` no existen.

- [ ] **Step 3: Extender `listarCaptados`**

En `frontend/src/lib/board/captados.ts`:

```typescript
export interface CasoCaptado {
  id: string;
  conversationId: string;
  ultimoMensaje: string | null;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  /** Primer párrafo de la síntesis; null si el caso todavía no tiene. */
  situacion: string | null;
}
```

En el `select` del `findMany`, agregar `id: true` y `sintesis: { select: { contenido: true } }`. En el `map`, agregar:

```typescript
      id: caso.id,
      situacion: situacionDe(caso.sintesis?.contenido),
```

Y el extractor, defensivo como el de `metricas-funnel`:

```typescript
/**
 * La `situacion` de la síntesis guardada. El Json de Postgres no está tipado y
 * acá no se valida el objeto entero a propósito: el listado solo muestra este
 * campo, y una síntesis vieja a la que le falte otro no tiene por qué
 * desaparecer de la tabla. La validación completa vive en `asegurarSintesis`.
 */
function situacionDe(contenido: unknown): string | null {
  if (contenido === null || typeof contenido !== "object") return null;
  const situacion = (contenido as { situacion?: unknown }).situacion;
  return typeof situacion === "string" && situacion.trim() !== "" ? situacion : null;
}
```

- [ ] **Step 4: Extender `PedidoFueraDeCobertura`**

En `frontend/src/lib/board/metricas-funnel.ts`, agregar `casoId: string` a la interfaz, `id: true` al `select` del `findMany` de pedidos, y `casoId: pedido.id` al `map`.

- [ ] **Step 5: Actualizar la UI**

En `MetricasPanel.tsx`, en la tabla de casos captados: cambiar `key={caso.conversationId}` por `key={caso.id}`, agregar una columna "Caso" con la situación recortada, y cambiar el enlace:

```tsx
                      <th scope="col">Caso</th>
```

```tsx
                        <td className={styles.celdaResumen}>{caso.situacion ?? "—"}</td>
```

```tsx
                          <Link href={`/board/casos/${caso.id}`} className={styles.link}>
                            Ver caso
                          </Link>
```

En la lista de pedidos fuera de cobertura: cambiar `key={pedido.conversationId}` por `key={pedido.casoId}` —una conversación puede tener varios pedidos, así que la key anterior se repetía— y agregar el enlace:

```tsx
                <li key={pedido.casoId} className={styles.item}>
                  <span className={styles.fecha}>{pedido.fecha.slice(0, 10)}</span>
                  <span>{pedido.resumen ?? "Sin resumen registrado"}</span>
                  <Link href={`/board/casos/${pedido.casoId}`} className={styles.link}>
                    Ver caso
                  </Link>
                </li>
```

En `metricas.module.css`, agregar `celdaResumen` con `max-width` y dos líneas visibles (`display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;`).

- [ ] **Step 6: Correr los tests**

```bash
cd frontend && pnpm test:unit run src/lib/board src/components/board && pnpm lint && pnpm typecheck
```

Esperado: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(board): lleva el listado de métricas a la vista del caso"
```

---

### Task 11: Generar la síntesis al captar

**Files:**
- Modify: `frontend/src/lib/clasificacion.ts:321-405` (`registrarDatosCaso`)
- Modify: `frontend/src/lib/clasificacion.test.ts`
- Modify: `frontend/src/lib/chat-orchestrator.ts:328-389`
- Modify: `frontend/src/lib/chat-orchestrator.test.ts`

**Interfaces:**
- Consumes: `asegurarSintesis` (Task 6).
- Produces: `registrarDatosCaso` pasa a devolver `Promise<{ casoId: string; captado: boolean } | null>` (null si no hay conversación).

- [ ] **Step 1: Escribir los tests que fallan**

En `frontend/src/lib/clasificacion.test.ts`:

```typescript
it("devuelve el caso tocado y si quedó captado", async () => {
  const resultado = await registrarDatosCaso({ sessionId: "sesion-1", contactoTelefono: "099111222" });
  expect(resultado).toEqual({ casoId: "caso-1", captado: true });
});

it("marca captado:false cuando el turno solo trajo hechos", async () => {
  const resultado = await registrarDatosCaso({ sessionId: "sesion-1", hechos: "Trabajó 6 años" });
  expect(resultado?.captado).toBe(false);
});
```

En `frontend/src/lib/chat-orchestrator.test.ts`:

```typescript
it("genera la síntesis del caso cuando el turno dejó el contacto", async () => {
  // Con el mock de registrarDatosCaso devolviendo { casoId: "caso-1", captado: true }
  // y el stream del agente emitiendo un tool-call de registrar-caso.
  await new Response(respuesta.body).text(); // drena el stream
  expect(asegurarSintesis).toHaveBeenCalledWith("caso-1");
});

// El disparo es "al captar", una sola vez: si corriera en cada turno con caso,
// sería una llamada de modelo por turno — lo que el spec descartó por costo.
it("no genera la síntesis en un turno que no captó contacto", async () => {
  await new Response(respuesta.body).text();
  expect(asegurarSintesis).not.toHaveBeenCalled();
});

// La síntesis es una comodidad: su falla no puede romper el turno del chat.
it("un fallo de la síntesis no rompe el stream", async () => {
  vi.mocked(asegurarSintesis).mockRejectedValue(new Error("backend caído"));
  const texto = await new Response(respuesta.body).text();
  expect(texto).toContain("data:");
});
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd frontend && pnpm test:unit run src/lib/clasificacion.test.ts src/lib/chat-orchestrator.test.ts
```

Esperado: FAIL.

- [ ] **Step 3: Devolver el caso desde `registrarDatosCaso`**

En `frontend/src/lib/clasificacion.ts`, cambiar la firma y el cuerpo de la transacción:

```typescript
export async function registrarDatosCaso(params: {
  sessionId: string;
  subcategorias?: string[];
  hechos?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  contactoEmail?: string;
}): Promise<{ casoId: string; captado: boolean } | null> {
  return prisma.$transaction(async (tx) => {
```

Dentro, `if (!conversation) return null;` ya existe; al final del bloque, después del `casoEvento.create`, devolver:

```typescript
    // El llamador usa esto para disparar la síntesis exactamente en el turno
    // que captó el contacto, y no en todos.
    return { casoId: caso.id, captado: tieneContacto };
  });
}
```

- [ ] **Step 4: Disparar la síntesis en el orquestador**

En `frontend/src/lib/chat-orchestrator.ts`, dentro del `onToolCall` del agente de categoría (línea ~336), capturar el caso captado en una variable del closure, junto a `temaDerivado`:

```typescript
      let temaDerivado: string | null = null;
      let casoCaptado: string | null = null;
```

```typescript
              const registrado = await registrarDatosCaso({ sessionId: params.sessionId, ...parsed.data });
              if (registrado?.captado === true) casoCaptado = registrado.casoId;
```

Y en el `.then()` que corre con el stream drenado, después de la derivación de tema:

```typescript
          // Fire-and-forget con el stream ya cerrado: el equipo legal encuentra
          // el resumen hecho al abrir el caso. Es una optimización de latencia
          // percibida y no la fuente de verdad — la vista regenera si falta,
          // así que un fallo acá solo se loguea.
          if (casoCaptado !== null) {
            const casoId = casoCaptado;
            void asegurarSintesis(casoId).catch((error: unknown) => {
              logger.error("síntesis del caso captado falló", {
                error: error instanceof Error ? error.message : String(error),
              });
            });
          }
```

Aplicar el mismo `if (registrado?.captado === true)` en el `onToolCall` del receptor (línea ~216), que también puede captar contacto.

- [ ] **Step 5: Correr los tests**

```bash
cd frontend && pnpm test:unit run src/lib && pnpm lint && pnpm typecheck
```

Esperado: PASS. Verificar que ningún otro llamador de `registrarDatosCaso` rompa por el cambio de firma (los de las líneas ~513-515 ignoran el retorno, lo cual sigue siendo válido).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(board): genera la síntesis del caso en el turno que capta el contacto"
```

---

### Task 12: Verificación integral

**Files:**
- Modify: `CLAUDE.md` (sección de gotchas, solo si aparecieron)
- Modify: `docs/plans/2026-08-08-sintesis-caso-board.md` (estado)

- [ ] **Step 1: Correr todo**

```bash
cd backend && pnpm lint && pnpm test > /tmp/backend-test.log 2>&1; echo "backend exit: $?"
cd ../frontend && pnpm lint && pnpm typecheck && pnpm test:unit run > /tmp/frontend-test.log 2>&1; echo "frontend exit: $?"
```

Leer los logs **del archivo**, no por pipe: un pipe reporta el exit code del último comando y esconde una corrida que murió a mitad (gotcha documentado del proyecto).

- [ ] **Step 2: Levantar la app y verificar a mano**

```bash
cd backend && pnpm dev    # una terminal
cd frontend && pnpm dev   # otra terminal
```

Con Playwright MCP o el browser, entrar a `/board`, y verificar:
1. La tabla de casos captados muestra la columna "Caso" y el enlace dice "Ver caso".
2. El enlace abre `/board/casos/<id>` con el resumen arriba, el contacto y las notas.
3. Contrastar el resumen contra el chat (enlace "Ver chat completo"): cada dato afirmado tiene que estar dicho por el consultante. **Este es el chequeo que más importa** — es la propiedad anti-fabricación del §4.2 del spec.
4. Agregar una nota, recargar, verificar que persiste con autor y fecha.
5. "Regenerar" produce un resumen nuevo y actualiza la fecha.
6. Los pedidos fuera de cobertura enlazan a su caso.

Sacar capturas del tamaño del viewport (no `fullPage`: redimensiona y reinicia las animaciones de recharts).

- [ ] **Step 3: Verificar la degradación**

Cortar el backend Mastra (`Ctrl+C`) y recargar la vista de un caso **sin** síntesis previa. Esperado: la página carga, muestra el contacto y las notas, y avisa que no se pudo generar el resumen. Ninguna pantalla en blanco, ningún 500.

- [ ] **Step 4: Documentar lo aprendido**

Si durante la implementación apareció algún gotcha nuevo (comportamiento de Mastra, Prisma, Next o del gateway que no estaba documentado), agregarlo a `CLAUDE.md` en la sección de gotchas, con fecha. Si no apareció ninguno, no inventar entradas.

Actualizar el encabezado del spec: `**Estado**: implementado`.

- [ ] **Step 5: Commit y PR**

```bash
git add -A
git commit -m "docs(board): registra la implementación de la síntesis de caso"
git push -u origin worktree-resumen-caso
gh pr create --title "feat(board): el resumen del caso como pieza central" --body "..."
```

El cuerpo del PR: qué problema resuelve, las decisiones del spec en tres líneas, y cómo verificarlo a mano.

---

## Notas de ejecución

**Orden.** Las tareas 1→11 son secuenciales por dependencia real de interfaces. La 4 y la 5 son independientes entre sí y pueden ir en cualquier orden.

**Tests que modifican archivos existentes** (tareas 4, 10 y 11). Los fragmentos de test de esas tareas están escritos contra el contenido nuevo, no contra el andamiaje del archivo: leé el archivo completo antes de agregarlos y seguí su patrón de mocks tal como está. En particular, usá `vi.resetAllMocks()` y no `vi.clearAllMocks()` — clear deja viva la cola de `mockResolvedValueOnce` y se filtra entre tests (gotcha documentado del proyecto).

**Qué revisar en cada tarea.** El punto de falla más probable de este plan no son los tests sino dos propiedades que ningún test unitario cubre solo: que el resumen **no invente** (se verifica leyendo contra el transcript, Task 12 paso 2.3) y que la huella **no regenere de más** (se verifica mirando que abrir dos veces el mismo caso no dispare dos llamadas al modelo).

**Si el modelo devuelve resúmenes pobres.** No tocar la huella ni la infraestructura: el problema está en `PROMPT_SINTESIS`. Iterar ahí, subir `PROMPT_VERSION` en los dos archivos (backend y `lib/casos/sintesis.ts`) y regenerar.
