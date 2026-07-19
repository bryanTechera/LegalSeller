# Sistema de rules/skills + workflow de conocimiento legal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar el sistema de rules/skills de colar sobre la factory `crearAgente` existente con migración byte-idéntica de los prompts, más guías `.claude/rules/` y la skill `procesar-documento-legal`.

**Architecture:** Un `ActivationRegistry` genérico con instancias `rulesRegistry` y `staticSkillsRegistry`; definiciones por dominio en `dominios/*/rules|static-skills|tool-skills`; los `instructions.ts` pasan a ser compositores finos (`rules.inicio → skills → rules.final → volátil`). Tool skills se convierten en tools Mastra `guia-<id>` vía `crearSkillTools`. Spec: `docs/plans/2026-07-19-sistema-skills-rules-prompting.md`.

**Tech Stack:** TypeScript ES Modules (imports con sufijo `.js`), Mastra v1 (subpath imports), Zod v4, Vitest, pnpm.

## Global Constraints

- **NUNCA `any`** — `unknown` + Zod; contratos como schema Zod.
- **NUNCA `console.log`** — logger estructurado (`fallbackLogger` de `common/logger.ts` fuera del runtime Mastra).
- **NUNCA una tool tira en `execute`** — degradación `{ status: "error", mensaje }`.
- **SIEMPRE imports por subpath de Mastra** (`@mastra/core/tools`), nunca el barrel.
- **Byte-igualdad**: tras la migración (Task 5), `buildRecepcionInstructions` y `buildLaboralInstructions` producen **exactamente el mismo string** que hoy para todo `readOnly`. Los strings de contenido en las rules/skills se copian **byte a byte** de los archivos actuales — no "mejorar" texto, no tocar espacios ni tildes.
- Naming: código inglés camelCase; IDs y archivos kebab-case español; prosa agent-facing en español rioplatense; tags XML en español.
- Contenido inyectado: sin la palabra "skill", sin emojis (guidelines heredadas de colar).
- El receptor NO recibe tool skills (spec §4.6). `crearAgente`, el BFF y el frontend no se tocan.
- Commits convencionales; lint + tests antes de cada commit.
- Todos los comandos backend se corren desde `backend/` (`cd backend`).

---

## Estructura de archivos (mapa completo)

```
backend/src/mastra/
├─ common/
│  ├─ activation-registry.ts          (CREATE — clase genérica + tipos)
│  ├─ activation-registry.test.ts     (CREATE)
│  └─ prompt-stages.ts                (DELETE en Task 5)
├─ rules/index.ts                     (CREATE — RULES + rulesRegistry + CRITICAL_RULE_IDS)
├─ skills/
│  ├─ index.ts                        (CREATE — STATIC_SKILLS + staticSkillsRegistry)
│  └─ tool-skills/
│     ├─ types.ts                     (CREATE — SkillToolDefinition)
│     ├─ index.ts                     (CREATE — TOOL_SKILLS + crearSkillTools)
│     └─ index.test.ts                (CREATE)
├─ dominios/
│  ├─ comunes/rules/identidad-jurco.ts        (CREATE)
│  ├─ comunes/rules/captacion-caso.ts         (CREATE)
│  ├─ recepcion/rules/caso-sensible.ts        (CREATE)
│  ├─ recepcion/rules/mision-clasificacion.ts (CREATE)
│  ├─ recepcion/rules/conduccion-triage.ts    (CREATE)
│  ├─ recepcion/static-skills/universo-categorias.ts (CREATE)
│  ├─ recepcion/instructions.ts               (MODIFY — compositor)
│  ├─ laboral/rules/rol-especialista-laboral.ts (CREATE)
│  ├─ laboral/rules/conducta-laboral.ts       (CREATE)
│  ├─ laboral/static-skills/subcategorias-laboral.ts (CREATE)
│  ├─ laboral/tool-skills/proceso-derivacion.ts (CREATE)
│  ├─ laboral/instructions.ts                 (MODIFY — compositor)
│  └─ laboral/index.ts                        (MODIFY — buildTools + skill tools)
└─ src/test/
   ├─ fixtures/instructions-pre-migracion.ts  (CREATE — builders congelados)
   └─ instructions-migracion.test.ts          (CREATE — gate byte-igualdad)

.claude/rules/{rules-and-skills-taxonomy,prompt-assembly,agent-prompting,eval-design}.md (CREATE)
.claude/skills/procesar-documento-legal/SKILL.md (CREATE)
docs/prompt-engineering/*.md (CREATE — copia de colar)
CLAUDE.md, docs/guia-codificacion-backend.md (MODIFY — punteros)
```

Orden global de registración de rules (el subset por agente preserva este orden):
`identidad-jurco` (crítica) → `caso-sensible` (crítica) → `mision-clasificacion` →
`conduccion-triage` → `rol-especialista-laboral` → `conducta-laboral` (crítica) →
`captacion-caso` (posicion "final").

---

### Task 1: Fixture congelado + gate de byte-igualdad (pre-migración)

Congela los builders actuales ANTES de tocar nada. El test compara fixture vs builders reales; hoy pasa trivialmente y en Task 5 se convierte en el gate de la migración.

**Files:**
- Create: `backend/src/test/fixtures/instructions-pre-migracion.ts`
- Create: `backend/src/test/instructions-migracion.test.ts`

**Interfaces:**
- Produces: `frozenRecepcionInstructions(readOnly: ReadOnlyState | null): string` y `frozenLaboralInstructions(readOnly: ReadOnlyState | null): string` — copias EXACTAS de los builders actuales con `PERSONA_STAGE`/`VENTA_STAGE` inlineados (el fixture no importa `prompt-stages.ts`, que se borra en Task 5; sí importa `registry.ts`, así el fixture y el builder real leen la misma data dinámica).

- [ ] **Step 1: Crear el fixture congelado**

`backend/src/test/fixtures/instructions-pre-migracion.ts` — los strings se copian byte a byte de `backend/src/mastra/common/prompt-stages.ts`, `backend/src/mastra/dominios/recepcion/instructions.ts` y `backend/src/mastra/dominios/laboral/instructions.ts` tal como están HOY en la rama:

```typescript
import type { ReadOnlyState } from "../../models/index.js";
import { CATEGORIAS, categoriasHabilitadas, subcategoriasHabilitadas } from "../../mastra/dominios/registry.js";

/**
 * Frozen byte-exact copies of the pre-migration prompt builders (spec §4.5).
 * PERSONA_STAGE / VENTA_STAGE are inlined because prompt-stages.ts is deleted
 * by the migration. Kept importing registry.ts so fixture and real builder
 * read the same dynamic taxonomy data.
 */

const PERSONA_STAGE = `<personalidad>
Sos el asistente legal de LegalSeller. Hablás en español rioplatense, de vos, con calidez profesional: escuchás primero, explicás claro y sin tecnicismos innecesarios, y nunca sonás a formulario ni a robot. Sos una sola voz en toda la conversación.
</personalidad>`;

const VENTA_STAGE = `<captacion>
Tu objetivo de fondo es que el usuario confíe y deje sus datos para que un abogado de nuestra red tome su caso.
- Primero aportá valor: respondé o reconocé el problema antes de pedir nada.
- Registrá con la herramienta registrar-caso cada dato relevante APENAS aparezca (hechos, fechas, subcategorías, intereses adicionales). Nunca preguntes algo cuya respuesta no vayas a registrar.
- Pedí los datos de contacto (nombre y teléfono o email) en el momento en que ya demostraste que entendés el caso — típicamente después de resolver la primera duda de fondo. Hacelo una sola vez con naturalidad; si el usuario no quiere, seguí ayudando igual.
- NUNCA vuelvas a preguntar algo que el usuario ya contó en la conversación.
- NUNCA condiciones una respuesta a que deje sus datos.
- "Eso lo va a evaluar el abogado que tome tu caso" es una respuesta válida cuando la consulta excede lo informativo.
</captacion>`;

export function frozenRecepcionInstructions(readOnly: ReadOnlyState | null): string {
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

export function frozenLaboralInstructions(readOnly: ReadOnlyState | null): string {
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

**Verificación del copiado**: antes de escribir el fixture, leé los tres archivos fuente actuales y copiá los template literals desde ahí (no desde este plan) — el plan reproduce el contenido para contexto, pero la fuente de verdad del byte-exacto son los archivos en la rama.

- [ ] **Step 2: Escribir el test de byte-igualdad**

`backend/src/test/instructions-migracion.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { buildLaboralInstructions } from "../mastra/dominios/laboral/instructions.js";
import { buildRecepcionInstructions } from "../mastra/dominios/recepcion/instructions.js";
import type { ReadOnlyState } from "../models/index.js";

import { frozenLaboralInstructions, frozenRecepcionInstructions } from "./fixtures/instructions-pre-migracion.js";

/**
 * Migration gate (spec §4.5): the composed prompt must be byte-identical to
 * the pre-migration builders for every readOnly shape. If this fails, the
 * migration changed the prompt — fix the migration, never the fixture.
 */
const CASOS: [string, ReadOnlyState | null][] = [
  ["readOnly null", null],
  ["solo userId", { userId: "s1" }],
  ["con userName", { userId: "s1", userName: "Ana" }],
  ["con casoBrief", { userId: "s1", casoBrief: "Despido sin liquidación tras 5 años." }],
  ["completo", { userId: "s1", userName: "Ana", casoBrief: "Despido sin liquidación tras 5 años." }],
];

describe("byte-igualdad de la migración a rules/skills", () => {
  it.each(CASOS)("recepcion: %s", (_nombre, readOnly) => {
    expect(buildRecepcionInstructions(readOnly)).toBe(frozenRecepcionInstructions(readOnly));
  });

  it.each(CASOS)("laboral: %s", (_nombre, readOnly) => {
    expect(buildLaboralInstructions(readOnly)).toBe(frozenLaboralInstructions(readOnly));
  });
});
```

- [ ] **Step 3: Correr el test — debe pasar YA (pre-migración)**

Run: `cd backend && pnpm vitest run src/test/instructions-migracion.test.ts`
Expected: 10 tests PASS. Si algo falla, el fixture no es copia fiel — corregí el fixture comparando con los archivos fuente (nunca al revés).

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/fixtures/instructions-pre-migracion.ts backend/src/test/instructions-migracion.test.ts
git commit -m "test: congelar prompts pre-migración como gate de byte-igualdad"
```

---

### Task 2: ActivationRegistry genérico

**Files:**
- Create: `backend/src/mastra/common/activation-registry.ts`
- Test: `backend/src/mastra/common/activation-registry.test.ts`

**Interfaces:**
- Consumes: `ReadOnlyState`, `AgentId` de `src/models/index.ts`; `fallbackLogger` de `common/logger.ts`.
- Produces: `interface RegistryItem { id: string; fn: (readOnly: ReadOnlyState | null, agentId: AgentId) => string | null; critical?: boolean; posicion?: "inicio" | "final" }`, `interface ExecuteResult { inicio: string; final: string; activatedIds: string[]; failedIds: string[] }`, `class ActivationRegistry { constructor(nombre: string, items: readonly RegistryItem[]); execute(readOnly, agentId): ExecuteResult }`.

- [ ] **Step 1: Escribir los tests (fallan: el módulo no existe)**

`backend/src/mastra/common/activation-registry.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { ActivationRegistry, type RegistryItem } from "./activation-registry.js";

const contenido = (texto: string): RegistryItem["fn"] => () => texto;
const soloPara = (agente: string, texto: string): RegistryItem["fn"] =>
  (_readOnly, agentId) => (agentId === agente ? texto : null);

describe("ActivationRegistry", () => {
  it("concatena en orden de registración solo los items que activan para el agente", () => {
    const registry = new ActivationRegistry("test", [
      { id: "a", fn: contenido("<a/>") },
      { id: "b", fn: soloPara("laboral", "<b/>") },
      { id: "c", fn: contenido("<c/>") },
    ]);
    const recepcion = registry.execute(null, "recepcion");
    expect(recepcion.inicio).toBe("<a/>\n\n<c/>");
    expect(recepcion.activatedIds).toEqual(["a", "c"]);

    const laboral = registry.execute(null, "laboral");
    expect(laboral.inicio).toBe("<a/>\n\n<b/>\n\n<c/>");
  });

  it("separa los items con posicion final", () => {
    const registry = new ActivationRegistry("test", [
      { id: "a", fn: contenido("<a/>") },
      { id: "z", fn: contenido("<z/>"), posicion: "final" },
      { id: "b", fn: contenido("<b/>") },
    ]);
    const result = registry.execute(null, "laboral");
    expect(result.inicio).toBe("<a/>\n\n<b/>");
    expect(result.final).toBe("<z/>");
    expect(result.activatedIds).toEqual(["a", "z", "b"]);
  });

  it("un item crítico que tira aborta la construcción con el id en el mensaje", () => {
    const registry = new ActivationRegistry("test", [
      { id: "rota", critical: true, fn: () => { throw new Error("boom"); } },
    ]);
    expect(() => registry.execute(null, "laboral")).toThrowError(/rota/);
  });

  it("un item no crítico que tira se omite y queda observable en failedIds", () => {
    const registry = new ActivationRegistry("test", [
      { id: "fragil", fn: () => { throw new Error("boom"); } },
      { id: "sana", fn: contenido("<sana/>") },
    ]);
    const result = registry.execute(null, "laboral");
    expect(result.inicio).toBe("<sana/>");
    expect(result.failedIds).toEqual(["fragil"]);
    expect(result.activatedIds).toEqual(["sana"]);
  });

  it("items que devuelven null no aparecen en activatedIds ni failedIds", () => {
    const registry = new ActivationRegistry("test", [{ id: "muda", fn: () => null }]);
    const result = registry.execute(null, "recepcion");
    expect(result).toEqual({ inicio: "", final: "", activatedIds: [], failedIds: [] });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/common/activation-registry.test.ts`
Expected: FAIL — `Cannot find module './activation-registry.js'`.

- [ ] **Step 3: Implementación**

`backend/src/mastra/common/activation-registry.ts`:

```typescript
import type { AgentId, ReadOnlyState } from "../../models/index.js";

import { fallbackLogger } from "./logger.js";

export interface RegistryItem {
  id: string;
  fn: (readOnly: ReadOnlyState | null, agentId: AgentId) => string | null;
  /** Si fn tira, el prompt NO se construye (el agente no corre con safety rota). */
  critical?: boolean;
  /** "final" = después de las static skills, con recencia (default "inicio"). */
  posicion?: "inicio" | "final";
}

export interface ExecuteResult {
  inicio: string;
  final: string;
  activatedIds: string[];
  failedIds: string[];
}

/**
 * Generic activation registry (spec §4.1, colar's pattern). Concatenates the
 * non-null blocks in registration order with a blank line. Critical failures
 * rethrow (combined with crearAgente's asymmetric null-guard: startup swallows,
 * a real request aborts); non-critical failures are observable in failedIds —
 * never a silent omission.
 */
export class ActivationRegistry {
  constructor(
    private readonly nombre: string,
    private readonly items: readonly RegistryItem[],
  ) {}

  execute(readOnly: ReadOnlyState | null, agentId: AgentId): ExecuteResult {
    const inicio: string[] = [];
    const final: string[] = [];
    const activatedIds: string[] = [];
    const failedIds: string[] = [];

    for (const item of this.items) {
      let content: string | null;
      try {
        content = item.fn(readOnly, agentId);
      } catch (error) {
        if (item.critical === true) {
          const detalle = error instanceof Error ? error.message : String(error);
          throw new Error(`Item crítico "${item.id}" del registry "${this.nombre}" falló al construir el prompt: ${detalle}`);
        }
        failedIds.push(item.id);
        fallbackLogger.warn(
          { registry: this.nombre, itemId: item.id, agentId, error: error instanceof Error ? error.message : String(error) },
          "Item de registry falló; se omite del prompt",
        );
        continue;
      }
      if (content === null) continue;
      activatedIds.push(item.id);
      (item.posicion === "final" ? final : inicio).push(content);
    }

    return { inicio: inicio.join("\n\n"), final: final.join("\n\n"), activatedIds, failedIds };
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd backend && pnpm vitest run src/mastra/common/activation-registry.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/mastra/common/activation-registry.ts backend/src/mastra/common/activation-registry.test.ts
git commit -m "feat: ActivationRegistry genérico para rules y static skills"
```

---

### Task 3: Definiciones de rules + rulesRegistry

Los strings de contenido son los MISMOS bytes de los prompts actuales (Global Constraints). Fuente de verdad para copiar: `prompt-stages.ts` y los dos `instructions.ts` actuales (todavía intactos en esta task).

**Files:**
- Create: `backend/src/mastra/dominios/comunes/rules/identidad-jurco.ts`
- Create: `backend/src/mastra/dominios/comunes/rules/captacion-caso.ts`
- Create: `backend/src/mastra/dominios/recepcion/rules/caso-sensible.ts`
- Create: `backend/src/mastra/dominios/recepcion/rules/mision-clasificacion.ts`
- Create: `backend/src/mastra/dominios/recepcion/rules/conduccion-triage.ts`
- Create: `backend/src/mastra/dominios/laboral/rules/rol-especialista-laboral.ts`
- Create: `backend/src/mastra/dominios/laboral/rules/conducta-laboral.ts`
- Create: `backend/src/mastra/rules/index.ts`
- Test: `backend/src/mastra/rules/index.test.ts`

**Interfaces:**
- Consumes: `ActivationRegistry`, `RegistryItem` (Task 2); `AgentId`, `ReadOnlyState` de `src/models/index.ts`.
- Produces: `rulesRegistry: ActivationRegistry`; `CRITICAL_RULE_IDS: string[]` (derivada de los items `critical`); una función exportada por rule con firma `(readOnly: ReadOnlyState | null, agentId: AgentId) => string | null` y nombre camelCase terminado en `Rule` (`identidadJurcoRule`, `captacionCasoRule`, `casoSensibleRule`, `misionClasificacionRule`, `conduccionTriageRule`, `rolEspecialistaLaboralRule`, `conductaLaboralRule`).

- [ ] **Step 1: Test de activación por agente (falla: módulos no existen)**

`backend/src/mastra/rules/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { CRITICAL_RULE_IDS, rulesRegistry } from "./index.js";

describe("rulesRegistry", () => {
  it("recepcion activa identidad, caso sensible, misión y conducción — en ese orden", () => {
    const result = rulesRegistry.execute(null, "recepcion");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "caso-sensible",
      "mision-clasificacion",
      "conduccion-triage",
    ]);
    expect(result.final).toBe("");
  });

  it("laboral activa identidad, rol, conducta y captación (final)", () => {
    const result = rulesRegistry.execute(null, "laboral");
    expect(result.activatedIds).toEqual([
      "identidad-jurco",
      "rol-especialista-laboral",
      "conducta-laboral",
      "captacion-caso",
    ]);
    expect(result.final).toContain("<captacion>");
    expect(result.inicio).not.toContain("<captacion>");
  });

  it("las rules críticas son las del spec", () => {
    expect(CRITICAL_RULE_IDS).toEqual(["identidad-jurco", "caso-sensible", "conducta-laboral"]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/rules/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Crear las 7 rules**

Patrón común (todas las rules tienen esta forma; solo cambian CONTENT y el nombre). `backend/src/mastra/dominios/comunes/rules/identidad-jurco.ts`:

```typescript
import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const PERSONALIDAD = `<personalidad>
Sos el asistente legal de LegalSeller. Hablás en español rioplatense, de vos, con calidez profesional: escuchás primero, explicás claro y sin tecnicismos innecesarios, y nunca sonás a formulario ni a robot. Sos una sola voz en toda la conversación.
</personalidad>`;

const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: PERSONALIDAD,
  laboral: PERSONALIDAD,
};

export function identidadJurcoRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
```

Los CONTENT de las 6 rules restantes, byte a byte (verificar además contra los archivos
fuente todavía intactos: `prompt-stages.ts` y los dos `instructions.ts`):

`backend/src/mastra/dominios/comunes/rules/captacion-caso.ts` — export `captacionCasoRule`:

```typescript
const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: `<captacion>
Tu objetivo de fondo es que el usuario confíe y deje sus datos para que un abogado de nuestra red tome su caso.
- Primero aportá valor: respondé o reconocé el problema antes de pedir nada.
- Registrá con la herramienta registrar-caso cada dato relevante APENAS aparezca (hechos, fechas, subcategorías, intereses adicionales). Nunca preguntes algo cuya respuesta no vayas a registrar.
- Pedí los datos de contacto (nombre y teléfono o email) en el momento en que ya demostraste que entendés el caso — típicamente después de resolver la primera duda de fondo. Hacelo una sola vez con naturalidad; si el usuario no quiere, seguí ayudando igual.
- NUNCA vuelvas a preguntar algo que el usuario ya contó en la conversación.
- NUNCA condiciones una respuesta a que deje sus datos.
- "Eso lo va a evaluar el abogado que tome tu caso" es una respuesta válida cuando la consulta excede lo informativo.
</captacion>`,
};
```

`backend/src/mastra/dominios/recepcion/rules/caso-sensible.ts` — export `casoSensibleRule`:

```typescript
const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<caso_sensible>
ANTES de cualquier otra cosa: si el relato sugiere violencia de género, riesgo personal o una urgencia donde alguien puede estar en peligro, llamá asignar-clasificacion con casoSensible: true y respondé SOLO con contención y canales de ayuda inmediata. Cero preguntas de triage.
TODO(expertos-legales): contenido y canales exactos pendientes de definición — mientras tanto: recomendá llamar al 911 ante peligro inmediato y a la línea gratuita 0800 4141 (violencia basada en género, Uruguay).
</caso_sensible>`,
};
```

`backend/src/mastra/dominios/recepcion/rules/mision-clasificacion.ts` — export `misionClasificacionRule`:

```typescript
const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<mision>
Tu única misión es clasificar la consulta en una categoría llamando a la herramienta asignar-clasificacion. NO respondés consultas legales de fondo ni buscás en ningún corpus: de eso se encarga el especialista que sigue.
</mision>`,
};
```

`backend/src/mastra/dominios/recepcion/rules/conduccion-triage.ts` — export `conduccionTriageRule`:

```typescript
const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<reglas>
- Clasificá desde lo que el usuario YA DIJO antes de preguntar nada. Si el primer mensaje alcanza con confianza alta: llamá asignar-clasificacion de inmediato y SIN escribir texto al usuario (incluí subcategoria si el relato la determina).
- Si necesitás más información: hacé máximo 2 preguntas en total, de a una, y cada pregunta debe ir acompañada de una frase de reconocimiento empático del problema. Nunca un turno que sea solo una pregunta.
- Agotadas las preguntas, asigná tu mejor hipótesis con confianza "baja".
- El campo brief debe resumir TODOS los hechos relatados (qué pasó, cuándo, contexto) para que el especialista no re-pregunte nada.
- Consulta de un tema legal que aún no cubrimos: asigná "categoria-no-habilitada" con temaDetectado, decilo con honestidad y ofrecé dejar contacto con registrar-caso ("un abogado de nuestra red puede evaluarlo").
- Consulta que no es de nuestro universo legal: asigná "fuera-de-universo" y despedite con amabilidad.
- NUNCA anuncies la clasificación ni el funcionamiento interno.
</reglas>`,
};
```

`backend/src/mastra/dominios/laboral/rules/rol-especialista-laboral.ts` — export `rolEspecialistaLaboralRule`:

```typescript
const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: `<rol>
Sos el especialista en derecho laboral de LegalSeller. Conducís la conversación completa: escuchás, evacuás dudas con respaldo del corpus y captás el caso para derivarlo a un abogado de la red.
</rol>`,
};
```

`backend/src/mastra/dominios/laboral/rules/conducta-laboral.ts` — export `conductaLaboralRule` (spec §4.4 nota: el bloque NO se parte en esta migración):

```typescript
const CONTENT: Partial<Record<AgentId, string>> = {
  laboral: `<reglas>
- SIEMPRE buscá en el corpus con buscar-documentos antes de responder una consulta sustantiva, filtrando por tus subcategorías (categoria: "laboral").
- SIEMPRE citá la fuente (título del documento y sección) de cada afirmación basada en el corpus.
- NUNCA inventes contenido legal ni cites documentos que no devolvió la búsqueda.
- Si la búsqueda no encuentra fuentes, decilo con claridad y no respondas con conocimiento general como si fuera del corpus.
- NUNCA des asesoramiento legal personalizado definitivo: la respuesta es informativa y basada en los documentos disponibles.
- Si la consulta encaja en tu área pero en una subcategoría todavía sin corpus, sé honesto y ofrecé la captación igual.
- Si es evidente que la conversación fue mal clasificada (el problema real es de otra área), usá corregir-clasificacion (disponible una sola vez). Un tema adicional NO es un error de clasificación: registralo como interesAdicional.
</reglas>`,
};
```

- [ ] **Step 4: Crear el registry**

`backend/src/mastra/rules/index.ts`:

```typescript
import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { captacionCasoRule } from "../dominios/comunes/rules/captacion-caso.js";
import { identidadJurcoRule } from "../dominios/comunes/rules/identidad-jurco.js";
import { conductaLaboralRule } from "../dominios/laboral/rules/conducta-laboral.js";
import { rolEspecialistaLaboralRule } from "../dominios/laboral/rules/rol-especialista-laboral.js";
import { casoSensibleRule } from "../dominios/recepcion/rules/caso-sensible.js";
import { conduccionTriageRule } from "../dominios/recepcion/rules/conduccion-triage.js";
import { misionClasificacionRule } from "../dominios/recepcion/rules/mision-clasificacion.js";

/**
 * Global registration order IS prompt order (spec §4.1); each agent's subset
 * preserves it. captacion-caso goes "final": behavioral goal with recency,
 * after the knowledge blocks (spec §4.4).
 */
const RULES: readonly RegistryItem[] = [
  { id: "identidad-jurco", fn: identidadJurcoRule, critical: true },
  { id: "caso-sensible", fn: casoSensibleRule, critical: true },
  { id: "mision-clasificacion", fn: misionClasificacionRule },
  { id: "conduccion-triage", fn: conduccionTriageRule },
  { id: "rol-especialista-laboral", fn: rolEspecialistaLaboralRule },
  { id: "conducta-laboral", fn: conductaLaboralRule, critical: true },
  { id: "captacion-caso", fn: captacionCasoRule, posicion: "final" },
];

export const CRITICAL_RULE_IDS = RULES.filter((r) => r.critical === true).map((r) => r.id);

export const rulesRegistry = new ActivationRegistry("rules", RULES);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && pnpm vitest run src/mastra/rules/index.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mastra/dominios/comunes backend/src/mastra/dominios/recepcion/rules backend/src/mastra/dominios/laboral/rules backend/src/mastra/rules
git commit -m "feat: rules por dominio + rulesRegistry con orden y críticas del spec"
```

---

### Task 4: Static skills + staticSkillsRegistry

**Files:**
- Create: `backend/src/mastra/dominios/recepcion/static-skills/universo-categorias.ts`
- Create: `backend/src/mastra/dominios/laboral/static-skills/subcategorias-laboral.ts`
- Create: `backend/src/mastra/skills/index.ts`
- Test: `backend/src/mastra/skills/index.test.ts`

**Interfaces:**
- Consumes: `ActivationRegistry`, `RegistryItem` (Task 2); `CATEGORIAS`, `categoriasHabilitadas`, `subcategoriasHabilitadas` de `dominios/registry.ts`.
- Produces: `staticSkillsRegistry: ActivationRegistry`; `universoCategoriasSkill` y `subcategoriasLaboralSkill` con la misma firma que las rules.

- [ ] **Step 1: Test (falla)**

`backend/src/mastra/skills/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { staticSkillsRegistry } from "./index.js";

describe("staticSkillsRegistry", () => {
  it("recepcion recibe el universo de categorías (habilitadas + no cubiertas)", () => {
    const result = staticSkillsRegistry.execute(null, "recepcion");
    expect(result.activatedIds).toEqual(["universo-categorias"]);
    expect(result.inicio).toContain("<categorias_habilitadas>");
    expect(result.inicio).toContain("<temas_aun_no_cubiertos>");
    expect(result.inicio).toContain("laboral");
  });

  it("laboral recibe sus subcategorías habilitadas", () => {
    const result = staticSkillsRegistry.execute(null, "laboral");
    expect(result.activatedIds).toEqual(["subcategorias-laboral"]);
    expect(result.inicio).toContain("<subcategorias>");
    expect(result.inicio).toContain("despido");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/skills/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Crear las dos static skills**

`backend/src/mastra/dominios/recepcion/static-skills/universo-categorias.ts` — reproduce byte a byte los bloques dinámicos del builder actual del receptor:

```typescript
import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { CATEGORIAS, categoriasHabilitadas } from "../../registry.js";

export function universoCategoriasSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "recepcion") return null;
  const habilitadas = categoriasHabilitadas()
    .map((c) => `- ${c.id}: ${c.descripcion} Señales: ${c.seniales.join("; ")}`)
    .join("\n");
  const noHabilitadas = CATEGORIAS.filter((c) => !c.habilitada)
    .map((c) => `- ${c.nombre}: ${c.descripcion}`)
    .join("\n");
  return `<categorias_habilitadas>
${habilitadas}
</categorias_habilitadas>

<temas_aun_no_cubiertos>
${noHabilitadas}
</temas_aun_no_cubiertos>`;
}
```

`backend/src/mastra/dominios/laboral/static-skills/subcategorias-laboral.ts`:

```typescript
import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { subcategoriasHabilitadas } from "../../registry.js";

export function subcategoriasLaboralSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "laboral") return null;
  const subcats = subcategoriasHabilitadas("laboral")
    .map((s) => `- ${s.id}: ${s.descripcion}`)
    .join("\n");
  return `<subcategorias>
Determiná la(s) subcategoría(s) del caso durante la conversación y registralas con registrar-caso apenas las detectes. Subcategorías habilitadas:
${subcats}
</subcategorias>`;
}
```

- [ ] **Step 4: Crear el registry**

`backend/src/mastra/skills/index.ts`:

```typescript
import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { subcategoriasLaboralSkill } from "../dominios/laboral/static-skills/subcategorias-laboral.js";
import { universoCategoriasSkill } from "../dominios/recepcion/static-skills/universo-categorias.js";

const STATIC_SKILLS: readonly RegistryItem[] = [
  { id: "universo-categorias", fn: universoCategoriasSkill },
  { id: "subcategorias-laboral", fn: subcategoriasLaboralSkill },
];

export const staticSkillsRegistry = new ActivationRegistry("static-skills", STATIC_SKILLS);
```

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd backend && pnpm vitest run src/mastra/skills/index.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/mastra/dominios/recepcion/static-skills backend/src/mastra/dominios/laboral/static-skills backend/src/mastra/skills/index.ts backend/src/mastra/skills/index.test.ts
git commit -m "feat: static skills de taxonomía + staticSkillsRegistry"
```

---

### Task 5: Migración de los compositores (el switch) + borrar prompt-stages

El gate de Task 1 es el juez: tras esta task, byte-igualdad total.

**Files:**
- Modify: `backend/src/mastra/dominios/recepcion/instructions.ts` (reemplazo completo)
- Modify: `backend/src/mastra/dominios/laboral/instructions.ts` (reemplazo completo)
- Delete: `backend/src/mastra/common/prompt-stages.ts`
- Tests (ya existen, no se tocan): `instructions-migracion.test.ts` (Task 1), `instructions.test.ts` de ambos dominios

**Interfaces:**
- Consumes: `rulesRegistry` (Task 3), `staticSkillsRegistry` (Task 4).
- Produces: `buildRecepcionInstructions` / `buildLaboralInstructions` con la MISMA firma actual `(readOnly: ReadOnlyState | null) => string` (consumidas por `dominios/*/index.ts` sin cambios).

- [ ] **Step 1: Reemplazar `backend/src/mastra/dominios/recepcion/instructions.ts`**

```typescript
import type { ReadOnlyState } from "../../../models/index.js";
import { rulesRegistry } from "../../rules/index.js";
import { staticSkillsRegistry } from "../../skills/index.js";

/**
 * Global receptor: single conversational classifier (spec §3). Thin composer
 * over the registries (spec 2026-07-19-sistema-skills-rules §4.4): rules
 * inicio → static skills → rules final → volatile blocks. Byte-identical to
 * the pre-migration prompt (gate: src/test/instructions-migracion.test.ts).
 */
export function buildRecepcionInstructions(readOnly: ReadOnlyState | null): string {
  const rules = rulesRegistry.execute(readOnly, "recepcion");
  const skills = staticSkillsRegistry.execute(readOnly, "recepcion");

  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  const bloques = [rules.inicio, skills.inicio, rules.final].filter((b) => b !== "");
  return `${bloques.join("\n\n")}${userBlock}`;
}
```

- [ ] **Step 2: Reemplazar `backend/src/mastra/dominios/laboral/instructions.ts`**

```typescript
import type { ReadOnlyState } from "../../../models/index.js";
import { rulesRegistry } from "../../rules/index.js";
import { staticSkillsRegistry } from "../../skills/index.js";

/**
 * Category agent for Laboral (spec §4). Thin composer over the registries
 * (spec 2026-07-19-sistema-skills-rules §4.4): rules inicio → static skills →
 * rules final (captación con recencia) → volatile blocks. Byte-identical to
 * the pre-migration prompt (gate: src/test/instructions-migracion.test.ts).
 */
export function buildLaboralInstructions(readOnly: ReadOnlyState | null): string {
  const rules = rulesRegistry.execute(readOnly, "laboral");
  const skills = staticSkillsRegistry.execute(readOnly, "laboral");

  const briefBlock = readOnly?.casoBrief
    ? `\n\n<caso_recabado>\nLo que el usuario ya contó (NO re-preguntar nada de esto):\n${readOnly.casoBrief}\n</caso_recabado>`
    : "";
  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  const bloques = [rules.inicio, skills.inicio, rules.final].filter((b) => b !== "");
  return `${bloques.join("\n\n")}${briefBlock}${userBlock}`;
}
```

- [ ] **Step 3: Borrar prompt-stages**

```bash
rm backend/src/mastra/common/prompt-stages.ts
```

Verificar que nadie más lo importa: `grep -rn "prompt-stages" backend/src --include="*.ts"` → sin resultados.

- [ ] **Step 4: Correr el gate y los tests de instructions existentes**

Run: `cd backend && pnpm vitest run src/test/instructions-migracion.test.ts src/mastra/dominios/recepcion/instructions.test.ts src/mastra/dominios/laboral/instructions.test.ts`
Expected: PASS total (10 byte-tests + 6 existentes). Si un byte-test falla, vitest muestra el diff exacto: corregir el string de la rule/skill correspondiente (nunca el fixture).

- [ ] **Step 5: Commit**

```bash
git add backend/src/mastra/dominios/recepcion/instructions.ts backend/src/mastra/dominios/laboral/instructions.ts
git rm backend/src/mastra/common/prompt-stages.ts
git commit -m "refactor: instructions como compositores de registries (byte-idéntico)"
```

---

### Task 6: Tool skills + seed proceso-derivacion + wiring en laboral

**Files:**
- Create: `backend/src/mastra/skills/tool-skills/types.ts`
- Create: `backend/src/mastra/skills/tool-skills/index.ts`
- Create: `backend/src/mastra/dominios/laboral/tool-skills/proceso-derivacion.ts`
- Modify: `backend/src/mastra/dominios/laboral/index.ts` (buildTools)
- Test: `backend/src/mastra/skills/tool-skills/index.test.ts`

**Interfaces:**
- Consumes: `createTool` de `@mastra/core/tools`; `z` de zod; `AgentId`, `ReadOnlyState`.
- Produces: `interface SkillToolDefinition { id: string; description: string | Partial<Record<AgentId, string>>; content: Partial<Record<AgentId, string>>; shouldActivate?: (readOnly: ReadOnlyState | null) => boolean }`; `crearSkillTools(agentId: AgentId, readOnly: ReadOnlyState | null): Record<string, unknown>` (mismo shape que consume `buildTools` de `crearAgente`); `procesoDerivacionSkillDef: SkillToolDefinition`.

- [ ] **Step 1: Test (falla)**

`backend/src/mastra/skills/tool-skills/index.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { crearSkillTools } from "./index.js";

interface ToolConEjecucion {
  id: string;
  description: string;
  execute: (ctx: unknown) => Promise<{ status: "ok"; contenido: string }>;
}

function esToolConEjecucion(value: unknown): value is ToolConEjecucion {
  return typeof value === "object" && value !== null && "execute" in value;
}

describe("crearSkillTools", () => {
  it("laboral recibe guia-proceso-derivacion y la tool devuelve el contenido", async () => {
    const tools = crearSkillTools("laboral", null);
    const tool = tools["guia-proceso-derivacion"];
    expect(tool).toBeDefined();
    if (!esToolConEjecucion(tool)) throw new Error("la tool no expone execute");
    const result = await tool.execute({ context: {} });
    expect(result.status).toBe("ok");
    expect(result.contenido).toContain("<proceso_derivacion>");
    expect(result.contenido).toContain("abogado");
  });

  it("recepcion no recibe tool skills (spec §4.6)", () => {
    expect(Object.keys(crearSkillTools("recepcion", null))).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && pnpm vitest run src/mastra/skills/tool-skills/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Tipos**

`backend/src/mastra/skills/tool-skills/types.ts`:

```typescript
import type { AgentId, ReadOnlyState } from "../../../models/index.js";

export interface SkillToolDefinition {
  /** kebab-case español; la tool Mastra se publica como `guia-<id>`. */
  id: string;
  /** Triggers de invocación ("Muy útil cuando..."). String único o por agente. */
  description: string | Partial<Record<AgentId, string>>;
  /** Conocimiento por agente. Sin key para un agente = la tool no existe para él. */
  content: Partial<Record<AgentId, string>>;
  /** Activación condicional sobre el estado; ausente = siempre disponible. */
  shouldActivate?: (readOnly: ReadOnlyState | null) => boolean;
}
```

- [ ] **Step 4: Seed proceso-derivacion**

`backend/src/mastra/dominios/laboral/tool-skills/proceso-derivacion.ts` — contenido respaldado por `docs/vision-producto.md` (funnel pasos 5-6); sin plazos ni honorarios (no definidos — pregunta abierta registrada en el spec §10):

```typescript
import type { SkillToolDefinition } from "../../../skills/tool-skills/types.js";

export const procesoDerivacionSkillDef: SkillToolDefinition = {
  id: "proceso-derivacion",
  description: `Carga la guía sobre qué pasa después de que el consultante deja sus datos (revisión del caso, clasificación y derivación a un abogado de la red).

Muy útil cuando:
- El consultante pregunta cómo sigue el proceso o qué van a hacer con sus datos.
- Duda de dejar su contacto y necesita entender qué recibe a cambio.
- Pregunta cuándo o quién lo va a contactar.`,
  content: {
    laboral: `<proceso_derivacion>
Qué pasa después de que el consultante deja sus datos de contacto:
- Su consulta y la información del caso quedan registradas como un caso captado.
- Un equipo humano especializado revisa el caso, lo clasifica y lo deriva al abogado de la red con el perfil adecuado.
- Ese abogado es quien contacta al consultante para evaluar el caso y definir los pasos a seguir. El sistema no asigna abogados por sí solo ni reemplaza esa evaluación.
- No prometas plazos de contacto ni hables de honorarios: no están definidos en la información disponible. Si preguntan, respondé con honestidad que eso lo conversa directamente el abogado que tome el caso.
</proceso_derivacion>`,
  },
};
```

- [ ] **Step 5: Registry + crearSkillTools**

`backend/src/mastra/skills/tool-skills/index.ts`:

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { AgentId, ReadOnlyState } from "../../../models/index.js";
import { procesoDerivacionSkillDef } from "../../dominios/laboral/tool-skills/proceso-derivacion.js";

import type { SkillToolDefinition } from "./types.js";

const TOOL_SKILLS: readonly SkillToolDefinition[] = [procesoDerivacionSkillDef];

const outputSchema = z.object({
  status: z.enum(["ok"]),
  contenido: z.string(),
});

/**
 * Materializes the active tool-skill definitions for an agent as Mastra tools
 * named `guia-<id>` (spec §4.6). The execute closure returns pre-resolved
 * static content, so nothing can throw at call time (repo rule: tools never
 * throw in execute — here satisfied by construction).
 */
export function crearSkillTools(agentId: AgentId, readOnly: ReadOnlyState | null): Record<string, unknown> {
  const tools: Record<string, unknown> = {};
  for (const def of TOOL_SKILLS) {
    const contenido = def.content[agentId];
    if (contenido === undefined) continue;
    if (def.shouldActivate !== undefined && !def.shouldActivate(readOnly)) continue;
    const description = typeof def.description === "string" ? def.description : def.description[agentId];
    if (description === undefined) continue;
    const toolId = `guia-${def.id}`;
    tools[toolId] = createTool({
      id: toolId,
      description,
      outputSchema,
      // eslint-disable-next-line @typescript-eslint/require-await
      execute: async () => ({ status: "ok" as const, contenido }),
    });
  }
  return tools;
}
```

- [ ] **Step 6: Wiring en laboral**

`backend/src/mastra/dominios/laboral/index.ts` — el `buildTools` pasa a recibir `readOnly` y agrega las skill tools:

```typescript
import { crearAgente } from "../../common/crear-agente.js";
import { sharedMemory } from "../../common/memory/index.js";
import { crearSkillTools } from "../../skills/tool-skills/index.js";
import { registrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { corregirClasificacionTool } from "../../tools/clasificacion/corregir-clasificacion-tool.js";
import { searchDocumentsTool } from "../../tools/documentos/buscar-documentos-tool.js";

import { buildLaboralInstructions } from "./instructions.js";

/** Category agent for Laboral: owns the conversation and the funnel (spec §4). */
export const laboralAgent = crearAgente({
  id: "laboral",
  name: "laboralAgent",
  description: "Agente principal de la categoría Laboral: evacúa dudas con citas del corpus y capta el caso.",
  buildInstructions: buildLaboralInstructions,
  buildTools: (readOnly) => ({
    [searchDocumentsTool.id]: searchDocumentsTool,
    [registrarCasoTool.id]: registrarCasoTool,
    [corregirClasificacionTool.id]: corregirClasificacionTool,
    ...crearSkillTools("laboral", readOnly),
  }),
  memory: sharedMemory,
});
```

`recepcion/index.ts` NO se toca (sin tool skills, spec §4.6).

- [ ] **Step 7: Correr y verificar que pasa**

Run: `cd backend && pnpm vitest run src/mastra/skills/tool-skills/index.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/mastra/skills/tool-skills backend/src/mastra/dominios/laboral/tool-skills backend/src/mastra/dominios/laboral/index.ts
git commit -m "feat: tool skills con seed proceso-derivacion cableada en laboral"
```

---

### Task 7: Gates completos del backend

**Files:** ninguno nuevo — verificación integral.

- [ ] **Step 1: Suite completa + lint + tipos**

Run: `cd backend && pnpm test && pnpm lint && pnpm exec tsc --noEmit`
Expected: todo verde. Arreglar cualquier falla (respetando byte-igualdad: los strings de contenido no se tocan).

- [ ] **Step 2: Evals del receptor (gate de regresión de comportamiento)**

Run: `cd backend && pnpm evals`
Expected: score ≥ 0.9 (12/12 esperado, igual que pre-migración). Requiere `.env` con las keys reales (igual que el dev server). Si falla un item, comparar el prompt ensamblado vs fixture — con byte-igualdad verde, una regresión de evals solo puede venir de la tool nueva; en ese caso reportar BLOCKED con la evidencia (no "arreglar" tocando prompts).

- [ ] **Step 3: Commit (solo si hubo fixes)**

```bash
git add -A && git commit -m "fix: ajustes post-gates de la migración a registries"
```

---

### Task 8: Guías — rules-and-skills-taxonomy.md + prompt-assembly.md

Las guías son dev-facing (en inglés técnico/español mixto como las de colar; prosa español está bien). Fuente colar: `/home/bryan/agent/.claude/rules/rules-and-skills-taxonomy.md`. La adaptación NO es copia ciega: cambia taxonomía (3 destinos), ejemplos (legales), y elimina lo que no aplica (working memory validators, reports, agentes de colar).

**Files:**
- Create: `.claude/rules/rules-and-skills-taxonomy.md`
- Create: `.claude/rules/prompt-assembly.md`

- [ ] **Step 1: Escribir `.claude/rules/rules-and-skills-taxonomy.md`**

Estructura obligatoria (secciones en este orden):

1. **Título + propósito** (2 líneas) + link a los sources de colar (Anthropic context engineering + agent skills best practices).
2. **Taxonomy Definition** — tabla de 3 destinos, copiada del spec §3 (RAG / Skill / Rule con criterio y ejemplo cada uno), más fila "Compositor" apuntando a `dominios/*/instructions.ts` y los registries.
3. **Litmus Test** — tabla con ejemplos legales:

```markdown
| Contenido | Clasificación | Por qué |
|---|---|---|
| "NUNCA des asesoramiento legal personalizado definitivo" | **Rule** | Restricción de comportamiento |
| "Para dimensionar un despido, relevá antigüedad, salario y forma de despido" | **Skill** | Heurística de práctica profesional |
| "El art. X de la ley Y establece un plazo de Z días" | **RAG** | Texto normativo citable con fuente |
| "Sos el especialista en derecho laboral" | **Rule** | Identidad/rol |

**Litmus clave**: si el agente debería citarlo con fuente, va al RAG, no a una skill.
Las skills no embeben citas normativas ni números de artículo — refieren conceptos y
mandan a buscar-documentos. Una cita hardcodeada en un prompt no se actualiza cuando
cambia la ley y esquiva la regla "SIEMPRE citar fuente".
```

4. **Rule File Template** — el patrón real del proyecto (CONTENT map + función `*Rule`, con el ejemplo de `identidad-jurco.ts`), registración en `src/mastra/rules/index.ts`, flag `critical`, `posicion: "final"`.
5. **Shared Content Quality Guidelines** — portar de colar (mismos títulos de sección) adaptando ejemplos a legal: CRITICAL avoid the word "skill" (tabla igual); No emojis (tabla igual); Language: Rioplatense Spanish (igual, sin la terminología ANEP/MCN — reemplazar por "terminología legal uruguaya"); Content Voice (tabla adaptada: el contenido es conocimiento PARA el agente vendedor, no guiones literales para el consultante); Goldilocks Principle (ejemplo legal: rígido "Paso 1: preguntá la fecha del despido. Paso 2: ..." / vago "Tené en cuenta el contexto del caso" / heurística "Relevá los datos que un abogado necesita para evaluar un despido — antigüedad, salario, forma — a medida que la conversación los toque, sin interrogar"); Motivate Instructions (ejemplo: "NUNCA prometas plazos de contacto — no están definidos y una promesa incumplida destruye la confianza que sostiene la conversión"); Minimal but Sufficient + One idea = one time (igual); Example Quality (2-3 concretos); **Avoid Time-Sensitive Information adaptada**: lo que vence (leyes, montos, plazos normativos) vive en el RAG re-ingestable, nunca en skills — una skill solo puede referir el concepto.
6. **Checklist for All Injected Content** — la de colar, con el item nuevo: "[ ] Sin citas normativas embebidas (eso va al RAG)".

- [ ] **Step 2: Escribir `.claude/rules/prompt-assembly.md`**

Contenido (nuestro ensamblado, no el de colar):

```markdown
# Prompt Assembly — ensamblado del system prompt

> Sources: src/mastra/common/activation-registry.ts, src/mastra/rules/index.ts,
> src/mastra/skills/index.ts, src/mastra/skills/tool-skills/index.ts.
> Spec: docs/plans/2026-07-19-sistema-skills-rules-prompting.md

## Flujo end-to-end

1. Request entra a /api/agents/:id/stream; el middleware puebla RequestContext
   (READ_ONLY_KEY con el ReadOnlyState del BFF).
2. `crearAgente` resuelve instructions vía `buildDynamicInstructions` (null-guard
   asimétrico: startup sin contexto → string vacío; request real → throw si el
   build falla).
3. El `instructions.ts` del dominio compone:
   rules.inicio → static skills → rules.final → bloques volátiles (brief/usuario).
4. `ActivationRegistry.execute(readOnly, agentId)` filtra por agente (CONTENT map),
   concatena con \n\n en orden de registración y devuelve
   { inicio, final, activatedIds, failedIds }.

## Orden y atención

- El orden global de registración ES el orden del prompt; el subset por agente lo
  preserva. Contenido estable primero (cache implícito de Gemini), conocimiento en
  el medio, directivas de comportamiento con recencia al final (posicion: "final",
  hoy: captacion-caso), volátil último.
- Sin wrapper de capa: cada rule/skill lleva su propio tag XML en el contenido
  (decisión del spec §4.3 — preserva los prompts verificados en vivo).

## Rules críticas y error paths

- `critical: true` → si su fn tira con un request real, el prompt no se construye y
  el agente no corre (CRITICAL_RULE_IDS se deriva de la registración).
- Item no crítico que tira → se omite del prompt, va a failedIds y se loggea
  (nunca silent omission).

## Cómo agregar

- **Rule nueva**: archivo en `src/mastra/dominios/<dominio>/rules/<id>.ts`
  (CONTENT map + función `<id>Rule`), entrada en RULES de `src/mastra/rules/index.ts`
  en la posición de atención correcta, test de activación.
- **Static skill nueva**: análogo en `static-skills/` + `src/mastra/skills/index.ts`.
- **Tool skill nueva**: definición `SkillToolDefinition` en `tool-skills/` del
  dominio + registrarla en TOOL_SKILLS de `src/mastra/skills/tool-skills/index.ts`.
  La tool se publica como `guia-<id>`. Revisar si necesita anchor en una rule
  (ver rules-and-skills-taxonomy.md y la skill procesar-documento-legal).
- **Byte-igualdad como técnica**: para refactors de estructura de prompt sin cambio
  de contenido, congelar el prompt actual en un fixture y asertar igualdad exacta
  (ver src/test/instructions-migracion.test.ts). Para cambios de contenido, el gate
  es `pnpm evals`.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/rules-and-skills-taxonomy.md .claude/rules/prompt-assembly.md
git commit -m "docs: guías de taxonomía rules/skills/RAG y prompt assembly"
```

---

### Task 9: Guías — agent-prompting.md + eval-design.md + copia prompt-engineering

**Files:**
- Create: `.claude/rules/agent-prompting.md`
- Create: `.claude/rules/eval-design.md`
- Create: `docs/prompt-engineering/*.md` (8 archivos, copia)

- [ ] **Step 1: Escribir `.claude/rules/agent-prompting.md`**

Fuente: `/home/bryan/agent/.claude/rules/agent-prompting.md`. Portar TODAS estas secciones con sus sources, adaptando cada ejemplo pedagógico a uno legal y eliminando referencias a agentes/tools de colar:

1. **Core Principles** (Be Explicit / Add Context / Vigilant with Examples) — ejemplos con propuestas de respuesta legal.
2. **System Prompt Structure & Ordering** + **Lost in the Middle** — referencia a nuestro orden (rules → skills → final → volátil) en vez del de colar.
3. **XML Tags for Structure** — tags canónicos NUESTROS: `<personalidad>`, `<rol>`, `<reglas>`, `<mision>`, `<caso_sensible>`, `<captacion>`, `<subcategorias>`, `<categorias_habilitadas>`, `<temas_aun_no_cubiertos>`, `<caso_recabado>`, `<contexto_usuario>`, `<proceso_derivacion>`; regla anti-colisión con IDs de tools (`buscar-documentos`, `registrar-caso`, `asignar-clasificacion`, `corregir-clasificacion`, `guia-*`).
4. **Positive Framing** — NUNCA reservado a safety (ejemplos reales del proyecto: no inventar contenido legal, no asesoramiento definitivo).
5. **Instruction-Following in Modern Models** — las 3 subsecciones (bajar lenguaje agresivo para tool triggering; scope explícito; auditar contradicciones sobre el ensamblado completo) — con la nota de que auditar = leer el prompt ensamblado (`buildXInstructions`), no cada rule aislada.
6. **Multishot Prompting** — formato/voz sí, contenido de razonamiento no.
7. **Degrees of Freedom** — tabla legal:

```markdown
| Task Type | Freedom | Prompt Pattern |
|---|---|---|
| Datos del corpus legal (citas, plazos normativos) | **LOW** — citar textual con fuente | "Citá la fuente (título y sección) de cada afirmación basada en el corpus. No parafrasees el texto normativo." |
| Armado del caso (qué preguntar, qué registrar) | **MEDIUM** — heurísticas adaptables | "Registrá cada dato APENAS aparezca; preguntá solo lo que no podés inferir de la conversación" |
| Conversación de venta / empatía | **HIGH** — objetivos y límites, el agente decide | "Primero aportá valor; pedí contacto cuando ya demostraste entender el caso" |
```

8. **Thinking Configuration** — versión corta para nuestro stack: gemini-3-flash vía gateway con `temperature: 1` explícito y provider order pineado (gotchas de `crearAgente`); no declaramos `thinkingLevel` (default dinámico); si se agrega un agente de routing puro o workflow 2.5, consultar la tabla de colar (link al archivo de colar como referencia extendida).
9. **Agent Proactivity** — adaptado: registrar-caso proactivo (ya es regla de captación); prohibición de referencias a UI (el chat del home); search-before-acting no aplica (sin planificaciones) — omitir esa subsección.
10. **Feedback Loops** — oracle externo = `buscar-documentos` (el corpus), nunca auto-crítica; una sola pasada; validación semántica (una cita plausible pero inexistente es el peor drift).
11. **Synthesis Over Dump** + **Limiting Options** — con ejemplo de resultados de `buscar-documentos` (sintetizar 1-2 fuentes relevantes, no volcar todos los chunks).
12. **Terminology Consistency** — glosario legal:

```markdown
| Concepto | Usar siempre | Nunca |
|---|---|---|
| Persona que consulta | consultante (en prompts: "el usuario") | cliente, lead |
| Caso captado (lead) | caso | ticket, oportunidad |
| Área del derecho | categoría | dominio, rama |
| Tipo de consulta dentro del área | subcategoría | subtipo, tema |
| Pasaje a un abogado | derivación | escalamiento, transferencia |
| Profesional de la red | abogado de la red | partner, profesional asociado |
```

13. **Format Control** (markdown mínimo; razonamiento antes del resultado en templates estructurados).
14. **Common Mistakes** + **Checklist** — versión adaptada de las tablas de colar (sin filas de colar-only: formularios de planificación, `proponer-actualizar-planificacion`, includeThoughts).

- [ ] **Step 2: Escribir `.claude/rules/eval-design.md`**

Fuente: `/home/bryan/agent/.claude/rules/eval-design.md`. Portar completo con estos ajustes de contexto: los 5 sesgos LLM-as-judge y sus mitigaciones (igual, son generales); "When this applies" apunta a nuestro estado — hoy el único gate es programático (matcher de tool-calls del receptor, threshold 0.9 en `src/test/run-evals.ts`); cuando un documento del equipo legal traiga contenido que exija juzgar calidad de respuesta (citación, fidelidad al corpus), se crean scorers LLM-as-judge siguiendo esta guía; advertencia de family bias si el judge es Gemini como los agentes; calibración humana (κ ≥ 0.6) antes de gatear cualquier scorer LLM; error analysis bottom-up (portar la sección completa de colar).

- [ ] **Step 3: Copiar prompt-engineering**

```bash
mkdir -p docs/prompt-engineering
cp /home/bryan/agent/docs/prompt-engineering/*.md docs/prompt-engineering/
```

Expected: 8 archivos (`be-clear-and-direct`, `chain-of-thought`, `chain-prompts`, `long-context-tips`, `multishot-prompting`, `prefill-claudes-response`, `system-prompts`, `use-xml-tags`).

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/agent-prompting.md .claude/rules/eval-design.md docs/prompt-engineering
git commit -m "docs: guía de prompting de agentes, eval design y docs de prompt engineering"
```

---

### Task 10: Skill procesar-documento-legal + punteros en CLAUDE.md y guías

**Files:**
- Create: `.claude/skills/procesar-documento-legal/SKILL.md`
- Modify: `CLAUDE.md` (sección Documentación + regla nueva)
- Modify: `docs/guia-codificacion-backend.md` (referencia en sección de prompting)

- [ ] **Step 1: Escribir `.claude/skills/procesar-documento-legal/SKILL.md`**

```markdown
---
name: procesar-documento-legal
description: Use cuando el equipo de expertos legales envía un documento o material nuevo — triage por pieza hacia RAG/skill/rule, comparación con lo existente, implementación y evals. También al revisar material legal ya recibido pero no procesado.
---

# Procesar documento del equipo legal

Cada documento mejora el sistema de forma iterativa: corpus RAG, conocimiento de los
agentes (skills), restricciones (rules) y evals. Este proceso es obligatorio para TODO
material nuevo del equipo legal — no se ingiere ni se copia nada sin pasar por acá.

**Anunciar al inicio:** "Procesando el documento con la skill procesar-documento-legal."

**Guías de fondo:** `.claude/rules/rules-and-skills-taxonomy.md` (destinos y calidad),
`.claude/rules/agent-prompting.md` (cómo escribir contenido inyectado),
`.claude/rules/prompt-assembly.md` (cómo registrar), `.claude/rules/eval-design.md`
(cómo medir). Leerlas antes de decidir destinos.

## Checklist (crear un todo por fase)

### Fase 1 — Lectura completa
- Leer el documento ENTERO (nunca procesar por resumen ni por título).
- Identificar las piezas: un documento casi nunca es un solo destino. Una circular
  sobre despido puede traer texto normativo (RAG), criterios prácticos del experto
  (skill) y una restricción de alcance (rule).

### Fase 2 — Triage por pieza
Para CADA pieza, en orden:
1. ¿Aporta algo que el modelo base no tiene? (definiciones genéricas de derecho → descartar)
2. ¿Aplica a jurisdicción Uruguay? (otro ordenamiento → descartar, salvo pedido explícito)
3. ¿Es citable? → **RAG**. ¿Es accionable como conocimiento? → **skill**.
   ¿Es restricción de comportamiento? → **rule**. (Litmus test en la taxonomía.)
4. Descarte = decisión documentada con motivo (fase 6), no omisión silenciosa.

**Ambigüedad legal** (¿este criterio es correcto? ¿qué alcance tiene? ¿contradice la
ley vigente?): NO asumir ni inventar — formular la pregunta concreta al equipo de
expertos legales, registrarla (fase 6) y seguir con lo no ambiguo
(docs/lineamientos-generales.md §3.13).

### Fase 3 — Mapeo contra lo existente
- Corpus: consultar los documentos ya ingestados de la categoría (tabla Document por
  categoria/subcategoria) — ¿ya hay una versión de este texto?
- Skills/rules: `grep -ri "<concepto>" backend/src/mastra/dominios/` sobre rules,
  static-skills y tool-skills.
- Lo nuevo NO es automáticamente mejor:

| Nuevo vs existente | Acción |
|---|---|
| Más preciso Y más conciso | REPLACE |
| Más preciso pero más verboso | REWRITE condensando lo mejor de ambos |
| Igual de preciso | DISCARD el nuevo |
| Contradice lo existente | INVESTIGAR — pregunta al equipo legal cuál rige |

Nunca conservar dos versiones del mismo conocimiento.

### Fase 4 — Decisiones arquitectónicas
- ¿Static o tool skill? Test: ¿el agente SIEMPRE necesita esto cuando la condición da
  true? Sí → static. A veces → tool.
- ¿Split (cubre 2+ dominios, >120 líneas por agente) o merge (alto solape)?
- **Anchor**: si una rule/directiva activa instruye "ofrecé/explicá/proponé X" y X
  queda cubierto por una tool skill nueva, esa rule debe anclar la skill
  explícitamente ("ANTES de explicar X, cargá guia-<id>") — sin anchor el agente
  improvisa con conocimiento genérico en vez de cargar la guía curada.
- ¿Habilita categoría/subcategoría nueva? → registry
  (backend/src/mastra/dominios/registry.ts o clasificacion.ts del dominio) +
  docs/dominio-consultas.md (columna Estado con fecha). Habilitar categoría nueva
  además requiere su agente (seguir docs/guia-arquitectura.md §2).

### Fase 5 — Implementación
- RAG: `cd backend && pnpm ingest <archivo> --title "<título>" --categoria <cat>
  --subcategoria <subcat>`.
- Rules/skills: patrón y registración según `.claude/rules/prompt-assembly.md`;
  calidad según la taxonomía. Orden de preferencia:
  ELIMINAR > REESCRIBIR > CONDENSAR > REORGANIZAR > AGREGAR
  (la densidad sube; el tamaño total no crece).
- Contenido inyectado nuevo o modificado: auditar contradicciones contra el prompt
  ENSAMBLADO del agente (correr buildXInstructions y leerlo), no contra la rule
  aislada.

### Fase 6 — Verificación y registro
- `cd backend && pnpm test && pnpm lint && pnpm evals` — todo verde.
- Cada documento agrega o ajusta items del golden set que midan el gap que vino a
  cerrar (corpus nuevo → items de citación; conocimiento de clasificación → items de
  detección). Un documento que no mueve ninguna eval es sospechoso: ¿aportó algo?
- Registrar en docs/plans/ una entrada fechada
  (`YYYY-MM-DD-procesamiento-<documento>.md`): piezas, destinos, descartes con
  motivo, preguntas abiertas al equipo legal, evals agregadas.
- Commit convencional; nunca push directo a main.

## Red flags
- Ingerir un documento entero al RAG "porque es más fácil" sin triage por pieza.
- Copiar texto del experto a una skill con citas normativas embebidas (van al RAG).
- Agregar contenido sin buscar qué existe (acumular sin comparar).
- Asumir la respuesta a una duda legal en vez de derivarla al equipo de expertos.
- Terminar sin evals nuevas ni registro del procesamiento.
```

- [ ] **Step 2: Actualizar `CLAUDE.md`**

En la tabla de Documentación, agregar la fila:

```markdown
| `.claude/rules/` | Guías operativas: taxonomía rules/skills/RAG, prompting de agentes, prompt assembly, eval design |
```

En "Reglas críticas", agregar el bullet (después del bullet de expertos legales):

```markdown
- **SIEMPRE** procesar material nuevo del equipo legal con la skill `procesar-documento-legal` (`.claude/skills/`): triage por pieza hacia RAG/skill/rule, comparación con lo existente, evals. Nunca ingerir ni copiar contenido legal sin ese proceso.
```

- [ ] **Step 3: Actualizar `docs/guia-codificacion-backend.md`**

Localizar la sección de prompting (buscar "prompt" en el archivo) y agregar al final de esa sección:

```markdown
> El sistema de rules/skills (taxonomía RAG/skill/rule, registries, calidad de
> contenido inyectado) está definido en `.claude/rules/rules-and-skills-taxonomy.md`
> y `.claude/rules/prompt-assembly.md`. El contenido de los prompts vive en
> `src/mastra/dominios/*/rules|static-skills|tool-skills` — no editar instructions
> monolíticas.
```

Si la guía tiene afirmaciones que la migración volvió obsoletas (p. ej. referencias a `prompt-stages.ts` o a instructions monolíticas), actualizarlas en el mismo commit.

- [ ] **Step 4: Verificación final del repo**

Run: `cd backend && pnpm test && pnpm lint && cd .. && grep -rn "prompt-stages" --include="*.ts" backend/src | wc -l`
Expected: tests y lint verdes; `0` referencias a prompt-stages.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/procesar-documento-legal CLAUDE.md docs/guia-codificacion-backend.md
git commit -m "docs: skill procesar-documento-legal y punteros al sistema de rules/skills"
```
