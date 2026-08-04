# Fuentes del corpus en el board — plan de implementación

> **Para quien lo ejecute:** usá `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para implementarlo tarea por tarea. Los pasos usan checkbox (`- [ ]`) para el seguimiento.

**Diseño**: `docs/plans/2026-08-04-fuentes-rag-en-board.md` (leerlo antes de empezar).

**Goal:** hacer visible en `/board/chats/[id]` y en `/revision` qué recuperó el agente del corpus para responder cada mensaje, de forma que un abogado distinga "falta documentación" de "el agente interpretó mal", y pueda anotar el hallazgo sin salir de la pantalla.

**Architecture:** todo el trabajo es de lectura sobre datos que ya existen. Los spans de Mastra (`mastra.mastra_ai_spans`) guardan el `input` y el `output` completos de cada llamada a `buscar-documentos`. Se agrega un módulo puro que agrupa esas búsquedas por turno de agente y las ata a la respuesta que produjeron, el BFF las expone en el detalle de la conversación, y un componente compartido las muestra en una solapa de la columna derecha. Backend Mastra: sin cambios. Schema Prisma: sin cambios.

**Tech Stack:** Next.js 16 (App Router, RSC + client components), TypeScript estricto, Zod, Prisma (`$queryRaw` sobre el schema `mastra`), SWR, CSS Modules, Vitest + Testing Library, Playwright.

## Global Constraints

- **NUNCA** `any` — `unknown` + Zod. Contratos como schema Zod, tipos con `z.infer` o interfaces explícitas.
- **NUNCA** `console.log` — logger estructurado (`@/utils/logger`).
- **NUNCA** el browser habla directo con la base: todo pasa por el BFF.
- Todo parseo de `input`/`output` de spans es tolerante: un shape desconocido degrada a un estado visible, nunca tira.
- Los umbrales de similitud **no se replican en el frontend**: viven solo en `backend/src/mastra/tools/documentos/buscar-documentos-tool.ts`. La UI los nombra en prosa, sin el número.
- Prosa user-facing en español rioplatense (vos en indicativo; subjuntivo en negación tuteante). Sin emojis.
- Componentes en PascalCase (`PanelFuentes.tsx`), módulos de `lib/` en kebab/lowercase (`fuentes.ts`).
- Conventional commits. `pnpm lint` y `pnpm test:unit` en `frontend/` antes de cada commit.
- `vi.resetAllMocks()` (no `clearAllMocks`) en `beforeEach` de tests que encolan `mockResolvedValueOnce`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/lib/revision/fuentes.ts` (crear) | Tipos del dominio (`BusquedaCorpus`, `FragmentoRecuperado`) y helpers puros de presentación: citas para notas, resumen por respuesta, textos de la marca y del mapa. **Sin** `server-only`: lo importa un client component. |
| `frontend/src/lib/revision/busquedas.ts` (crear) | `server-only`. Schemas Zod de `input`/`output` de span, `agruparBusquedas` (pura, la atribución) y `construirBusquedas(threadId)` (las tres queries). |
| `frontend/src/lib/board/tecnico.ts` (crear) | Puro. Resume la timeline en agentes, modelos, tokens, costo y tools no-corpus, para el bloque plegado del panel `Caso`. |
| `frontend/src/components/revision/PanelFuentes.tsx` (crear) | Componente de presentación de las búsquedas. Vive en `components/revision/` por el precedente ya establecido: el board importa de ahí `NotaComposer` y `NotaThread`. |
| `frontend/src/components/revision/fuentes.module.css` (crear) | Estilos del panel. |
| `frontend/src/lib/board/conversaciones.ts` (modificar) | `DetalleConversacion` gana `busquedas`. |
| `frontend/src/components/board/Chats/DetalleChat.tsx` (modificar) | Marca por respuesta, selección, solapas `Fuentes`/`Caso`/`Notas`, notas desde el panel, timeline sin trazas técnicas. |
| `frontend/src/components/board/Chats/chats.module.css` (modificar) | Estilos de solapas, marca y bloque técnico. |
| `frontend/src/app/api/revision/sesiones/[id]/route.ts` (modificar) | Construye la timeline con spans y agrega `busquedas`. |
| `frontend/src/components/revision/SesionView.tsx` (modificar) | Monta `PanelFuentes` al costado del transcript. |
| `frontend/tests/board.spec.ts` (modificar) | E2E del recorrido completo. |

---

### Task 1: Tipos del dominio y helpers puros de presentación

**Files:**
- Create: `frontend/src/lib/revision/fuentes.ts`
- Test: `frontend/src/lib/revision/fuentes.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `FragmentoRecuperado`, `EstadoBusqueda`, `BusquedaCorpus`, `ResumenFuentes`, `citaDeBusqueda(busqueda): string`, `citaDeFragmento(fragmento): string`, `resumirPorRespuesta(busquedas): Map<string, ResumenFuentes>`, `textoDeMarca(resumen): string`, `textoDelMapa(busquedas): string`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/revision/fuentes.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  citaDeBusqueda,
  citaDeFragmento,
  resumirPorRespuesta,
  textoDeMarca,
  textoDelMapa,
  type BusquedaCorpus,
  type FragmentoRecuperado,
} from "./fuentes";

const fragmento: FragmentoRecuperado = {
  documentId: "d1",
  documentTitle: "Ley 10.489",
  section: "art. 4",
  content: "El empleador que despida sin causa deberá abonar una indemnización.",
  similarity: 0.7912,
};

function busqueda(sobreescribir: Partial<BusquedaCorpus> = {}): BusquedaCorpus {
  return {
    spanId: "t1",
    messageId: "m2",
    agente: "laboral",
    consulta: "indemnización por despido antigüedad",
    categoria: "laboral",
    subcategorias: ["despido"],
    estado: "ok",
    fragmentos: [fragmento],
    fecha: "2026-08-04T10:00:00.000Z",
    ...sobreescribir,
  };
}

describe("citaDeBusqueda", () => {
  it("cita la consulta que armó el agente", () => {
    expect(citaDeBusqueda(busqueda())).toBe("Búsqueda: «indemnización por despido antigüedad»");
  });
});

describe("citaDeFragmento", () => {
  it("lleva documento, sección y score", () => {
    expect(citaDeFragmento(fragmento)).toBe(
      "Ley 10.489 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("sin sección no deja el guión colgando", () => {
    expect(citaDeFragmento({ ...fragmento, section: null })).toBe(
      "Ley 10.489 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("recorta para no pasarse del máximo que acepta el schema de notas", () => {
    // crearNotaSchema limita citaTexto a 2000 caracteres: una cita más larga
    // haría fallar el POST con un 400 que el experto vería como "no pudimos
    // guardar la nota", sin pista de que el problema es el largo.
    const largo = citaDeFragmento({ ...fragmento, content: "x".repeat(4000) });
    expect(largo.length).toBeLessThanOrEqual(2000);
    expect(largo.endsWith("…»")).toBe(true);
  });
});

describe("resumirPorRespuesta", () => {
  it("acumula consultas y fragmentos por respuesta", () => {
    const resumen = resumirPorRespuesta([
      busqueda({ spanId: "t1" }),
      busqueda({ spanId: "t2", fragmentos: [fragmento, fragmento] }),
    ]);
    expect(resumen.get("m2")).toEqual({ consultas: 2, fragmentos: 3, vacias: 0 });
  });

  it("cuenta como vacía cualquier búsqueda que no haya vuelto ok", () => {
    const resumen = resumirPorRespuesta([
      busqueda({ spanId: "t1" }),
      busqueda({ spanId: "t2", estado: "empty", fragmentos: [] }),
      busqueda({ spanId: "t3", estado: "ilegible", fragmentos: [] }),
    ]);
    expect(resumen.get("m2")).toEqual({ consultas: 3, fragmentos: 1, vacias: 2 });
  });

  it("las búsquedas huérfanas no entran al resumen por respuesta", () => {
    const resumen = resumirPorRespuesta([busqueda({ messageId: null })]);
    expect(resumen.size).toBe(0);
  });
});

describe("textoDeMarca", () => {
  it("sin vacías informa consultas y fragmentos", () => {
    expect(textoDeMarca({ consultas: 2, fragmentos: 7, vacias: 0 })).toBe("2 consultas · 7 fragmentos");
  });

  it("singular en uno y otro lado", () => {
    expect(textoDeMarca({ consultas: 1, fragmentos: 1, vacias: 0 })).toBe("1 consulta · 1 fragmento");
  });

  it("todas vacías lo dice sin número redundante", () => {
    expect(textoDeMarca({ consultas: 1, fragmentos: 0, vacias: 1 })).toBe("1 consulta · sin resultados");
  });

  it("algunas vacías informa cuántas", () => {
    expect(textoDeMarca({ consultas: 3, fragmentos: 4, vacias: 1 })).toBe("3 consultas · 1 sin resultados");
  });
});

describe("textoDelMapa", () => {
  it("cuenta cuántas consultas quedaron sin fuentes", () => {
    const texto = textoDelMapa([
      busqueda({ spanId: "t1" }),
      busqueda({ spanId: "t2" }),
      busqueda({ spanId: "t3", estado: "empty", fragmentos: [] }),
    ]);
    expect(texto).toBe("1 de 3 consultas volvió sin fuentes");
  });

  it("todas con fuentes lo dice en positivo", () => {
    expect(textoDelMapa([busqueda()])).toBe("1 consulta, con fuentes");
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/revision/fuentes.test.ts
```

Esperado: FAIL — `Failed to resolve import "./fuentes"`.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/revision/fuentes.ts`:

```ts
/**
 * Tipos y presentación de las búsquedas al corpus. Módulo PURO y sin
 * `server-only` a propósito: lo importa `PanelFuentes`, que es un client
 * component. La lectura de la base vive en `busquedas.ts`, que sí es
 * server-only.
 */

export interface FragmentoRecuperado {
  documentId: string;
  documentTitle: string;
  section: string | null;
  content: string;
  similarity: number;
}

/** `ilegible` = el span existe pero su shape no matchea lo que sabemos parsear. */
export type EstadoBusqueda = "ok" | "empty" | "error" | "ilegible";

export interface BusquedaCorpus {
  spanId: string;
  /** Respuesta del agente a la que pertenece; null = huérfana (turno sin mensaje). */
  messageId: string | null;
  agente: string | null;
  consulta: string;
  categoria: string | null;
  subcategorias: string[];
  estado: EstadoBusqueda;
  fragmentos: FragmentoRecuperado[];
  fecha: string;
}

export interface ResumenFuentes {
  consultas: number;
  fragmentos: number;
  /** Búsquedas que no volvieron `ok` (vacías, con error o ilegibles). */
  vacias: number;
}

/** Tope de `citaTexto` en `crearNotaSchema`. */
const MAX_CITA = 2000;

function recortar(texto: string, maximo: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > maximo ? `${limpio.slice(0, Math.max(0, maximo - 1))}…` : limpio;
}

export function citaDeBusqueda(busqueda: BusquedaCorpus): string {
  return recortar(`Búsqueda: «${busqueda.consulta}»`, MAX_CITA);
}

export function citaDeFragmento(fragmento: FragmentoRecuperado): string {
  const seccion = fragmento.section ? ` — ${fragmento.section}` : "";
  const encabezado = `${fragmento.documentTitle}${seccion} (${fragmento.similarity.toFixed(2)}): `;
  const cuerpo = recortar(fragmento.content, MAX_CITA - encabezado.length - 2);
  return `${encabezado}«${cuerpo}»`;
}

export function resumirPorRespuesta(busquedas: BusquedaCorpus[]): Map<string, ResumenFuentes> {
  const porMensaje = new Map<string, ResumenFuentes>();
  for (const busqueda of busquedas) {
    if (busqueda.messageId === null) continue;
    const actual = porMensaje.get(busqueda.messageId) ?? { consultas: 0, fragmentos: 0, vacias: 0 };
    porMensaje.set(busqueda.messageId, {
      consultas: actual.consultas + 1,
      fragmentos: actual.fragmentos + busqueda.fragmentos.length,
      vacias: actual.vacias + (busqueda.estado === "ok" ? 0 : 1),
    });
  }
  return porMensaje;
}

function plural(cantidad: number, singular: string, plural: string): string {
  return `${String(cantidad)} ${cantidad === 1 ? singular : plural}`;
}

export function textoDeMarca(resumen: ResumenFuentes): string {
  const consultas = plural(resumen.consultas, "consulta", "consultas");
  if (resumen.vacias === 0) {
    return `${consultas} · ${plural(resumen.fragmentos, "fragmento", "fragmentos")}`;
  }
  if (resumen.vacias === resumen.consultas) return `${consultas} · sin resultados`;
  return `${consultas} · ${String(resumen.vacias)} sin resultados`;
}

export function textoDelMapa(busquedas: BusquedaCorpus[]): string {
  const vacias = busquedas.filter((busqueda) => busqueda.estado !== "ok").length;
  const total = plural(busquedas.length, "consulta", "consultas");
  if (vacias === 0) return `${total}, con fuentes`;
  return `${String(vacias)} de ${total} volvió sin fuentes`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd frontend && pnpm vitest run src/lib/revision/fuentes.test.ts
```

Esperado: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/revision/fuentes.ts frontend/src/lib/revision/fuentes.test.ts
git commit -m "feat(board): tipos y presentación de las búsquedas al corpus"
```

---

### Task 2: Atribución — agrupar cada búsqueda con la respuesta que produjo

Esta es la tarea de riesgo del plan. La regla ingenua (asignarle a cada respuesta las búsquedas cronológicamente anteriores) está **mal**: en producción el mensaje `assistant` se persiste antes que las búsquedas de su propio turno, así que esa regla corre todo un turno. La atribución va por la ventana `[startedAt, endedAt]` del `agent_run` ancestro.

**Files:**
- Create: `frontend/src/lib/revision/busquedas.ts`
- Test: `frontend/src/lib/revision/busquedas.test.ts`

**Interfaces:**
- Consumes: `BusquedaCorpus`, `FragmentoRecuperado`, `EstadoBusqueda` de `./fuentes` (Task 1).
- Produces: `SpanLigero`, `SpanBusqueda`, `MensajeAsistente`, `agruparBusquedas({ busquedas, spans, mensajes }): BusquedaCorpus[]`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/revision/busquedas.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { agruparBusquedas, type SpanBusqueda, type SpanLigero } from "./busquedas";

const chunk = {
  documentId: "d1",
  documentTitle: "Ley 10.489",
  section: "art. 4",
  content: "El empleador que despida sin causa deberá abonar una indemnización.",
  similarity: 0.79,
};

/**
 * Dos turnos consecutivos, con el mensaje del agente persistido ANTES de sus
 * propias búsquedas — el orden real de producción, verificado el 2026-08-04.
 */
const spans: SpanLigero[] = [
  { spanId: "run1", parentSpanId: null, spanType: "agent_run", entityName: "laboral", startedAt: new Date("2026-08-04T10:00:00Z"), endedAt: new Date("2026-08-04T10:00:08Z") },
  { spanId: "run2", parentSpanId: null, spanType: "agent_run", entityName: "laboral", startedAt: new Date("2026-08-04T10:01:00Z"), endedAt: new Date("2026-08-04T10:01:07Z") },
  { spanId: "t1", parentSpanId: "run1", spanType: "tool_call", entityName: "buscar-documentos", startedAt: new Date("2026-08-04T10:00:04Z"), endedAt: null },
  { spanId: "t2", parentSpanId: "run2", spanType: "tool_call", entityName: "buscar-documentos", startedAt: new Date("2026-08-04T10:01:04Z"), endedAt: null },
];

const mensajes = [
  { id: "m1", createdAt: new Date("2026-08-04T10:00:02Z") },
  { id: "m2", createdAt: new Date("2026-08-04T10:01:02Z") },
];

function spanBusqueda(spanId: string, parentSpanId: string | null, extra: Partial<SpanBusqueda> = {}): SpanBusqueda {
  return {
    spanId,
    parentSpanId,
    input: { query: `consulta de ${spanId}`, categoria: "laboral", subcategorias: ["despido"] },
    output: { status: "ok", chunks: [chunk] },
    error: null,
    startedAt: spanId === "t1" ? new Date("2026-08-04T10:00:04Z") : new Date("2026-08-04T10:01:04Z"),
    ...extra,
  };
}

describe("agruparBusquedas", () => {
  it("cada búsqueda queda en SU turno, no en el anterior", () => {
    // El caso que protege contra la regresión más creíble de esta feature:
    // agrupar por orden de reloj le colgaría t1 (10:00:04) a m2 (10:01:02),
    // porque m1 (10:00:02) ya estaba escrito antes de que t1 corriera.
    const resultado = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1"), spanBusqueda("t2", "run2")],
      spans,
      mensajes,
    });
    expect(resultado.map((busqueda) => [busqueda.spanId, busqueda.messageId])).toEqual([
      ["t1", "m1"],
      ["t2", "m2"],
    ]);
  });

  it("lee consulta, filtros, fragmentos y agente", () => {
    const [busqueda] = agruparBusquedas({ busquedas: [spanBusqueda("t1", "run1")], spans, mensajes });
    expect(busqueda).toMatchObject({
      consulta: "consulta de t1",
      categoria: "laboral",
      subcategorias: ["despido"],
      agente: "laboral",
      estado: "ok",
      fragmentos: [chunk],
    });
  });

  it("ordena los fragmentos de mayor a menor similitud", () => {
    const bajo = { ...chunk, documentId: "d2", similarity: 0.66 };
    const [busqueda] = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1", { output: { status: "ok", chunks: [bajo, chunk] } })],
      spans,
      mensajes,
    });
    expect(busqueda?.fragmentos.map((fragmento) => fragmento.similarity)).toEqual([0.79, 0.66]);
  });

  it("sube más de un nivel hasta el agent_run", () => {
    const conIntermedio: SpanLigero[] = [
      ...spans,
      { spanId: "step1", parentSpanId: "run1", spanType: "model_step", entityName: null, startedAt: new Date("2026-08-04T10:00:03Z"), endedAt: null },
    ];
    const [busqueda] = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "step1")],
      spans: conIntermedio,
      mensajes,
    });
    expect(busqueda?.messageId).toBe("m1");
  });

  it("con dos mensajes del agente en la misma ventana gana el último", () => {
    const dos = [...mensajes, { id: "m1b", createdAt: new Date("2026-08-04T10:00:06Z") }];
    const [busqueda] = agruparBusquedas({ busquedas: [spanBusqueda("t1", "run1")], spans, mensajes: dos });
    expect(busqueda?.messageId).toBe("m1b");
  });

  it("un turno sin endedAt (en curso) deja la ventana abierta", () => {
    const enCurso: SpanLigero[] = spans.map((span) =>
      span.spanId === "run1" ? { ...span, endedAt: null } : span,
    );
    const [busqueda] = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1")],
      spans: enCurso,
      // m2 cae después de run1.startedAt y run1 no cerró: gana el último.
      mensajes,
    });
    expect(busqueda?.messageId).toBe("m2");
  });

  it("sin agent_run ancestro la búsqueda queda huérfana, no se descarta", () => {
    const [busqueda] = agruparBusquedas({ busquedas: [spanBusqueda("t1", null)], spans, mensajes });
    expect(busqueda?.messageId).toBeNull();
    expect(busqueda?.consulta).toBe("consulta de t1");
  });

  it("turno sin mensaje del agente en su ventana: huérfana", () => {
    const [busqueda] = agruparBusquedas({ busquedas: [spanBusqueda("t1", "run1")], spans, mensajes: [] });
    expect(busqueda?.messageId).toBeNull();
  });

  it("status empty: estado empty y sin fragmentos", () => {
    const [busqueda] = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1", { output: { status: "empty", chunks: [] } })],
      spans,
      mensajes,
    });
    expect(busqueda).toMatchObject({ estado: "empty", fragmentos: [] });
  });

  it("span con error: estado error, con la consulta a la vista", () => {
    const [busqueda] = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1", { error: { message: "timeout" }, output: null })],
      spans,
      mensajes,
    });
    expect(busqueda).toMatchObject({ estado: "error", consulta: "consulta de t1" });
  });

  it("output de shape desconocido: ilegible, sin romper el resto", () => {
    const resultado = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1", { output: { resultados: ["formato viejo"] } }), spanBusqueda("t2", "run2")],
      spans,
      mensajes,
    });
    expect(resultado[0]).toMatchObject({ estado: "ilegible", consulta: "consulta de t1", fragmentos: [] });
    expect(resultado[1]?.estado).toBe("ok");
  });

  it("input ilegible: consulta vacía y estado ilegible", () => {
    const [busqueda] = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1", { input: { q: "shape viejo" } })],
      spans,
      mensajes,
    });
    expect(busqueda).toMatchObject({ estado: "ilegible", consulta: "", categoria: null, subcategorias: [] });
  });

  it("input y output guardados como string JSON se parsean igual", () => {
    const [busqueda] = agruparBusquedas({
      busquedas: [
        spanBusqueda("t1", "run1", {
          input: JSON.stringify({ query: "serializado", categoria: "familia" }),
          output: JSON.stringify({ status: "ok", chunks: [chunk] }),
        }),
      ],
      spans,
      mensajes,
    });
    expect(busqueda).toMatchObject({ consulta: "serializado", categoria: "familia", estado: "ok" });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/revision/busquedas.test.ts
```

Esperado: FAIL — `Failed to resolve import "./busquedas"`.

- [ ] **Step 3: Implementar la parte pura**

Crear `frontend/src/lib/revision/busquedas.ts` (por ahora solo tipos + `agruparBusquedas`; la lectura de base viene en la Task 3):

```ts
import "server-only";

import { z } from "zod";

import type { BusquedaCorpus, EstadoBusqueda, FragmentoRecuperado } from "./fuentes";

/** Span del thread sin payload: alcanza para armar el árbol y las ventanas. */
export interface SpanLigero {
  spanId: string;
  parentSpanId: string | null;
  spanType: string;
  entityName: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

/** Span de una llamada a `buscar-documentos`, con su payload. */
export interface SpanBusqueda {
  spanId: string;
  parentSpanId: string | null;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: Date;
}

export interface MensajeAsistente {
  id: string;
  createdAt: Date;
}

/** Mismo tope que usa `resolverAgente` en timeline.ts: corta ciclos y árboles raros. */
const MAX_SALTOS = 20;

const entradaSchema = z.object({
  query: z.string(),
  categoria: z.string().nullish(),
  subcategorias: z.array(z.string()).nullish(),
});

const fragmentoSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  section: z.string().nullish(),
  content: z.string(),
  similarity: z.number(),
});

const salidaSchema = z.object({
  status: z.enum(["ok", "empty", "error"]),
  chunks: z.array(fragmentoSchema).nullish(),
});

/** `input`/`output` pueden llegar como jsonb ya parseado o como string. */
function comoValor(crudo: unknown): unknown {
  if (typeof crudo !== "string") return crudo;
  try {
    return JSON.parse(crudo) as unknown;
  } catch {
    return crudo;
  }
}

interface Entrada {
  consulta: string;
  categoria: string | null;
  subcategorias: string[];
  legible: boolean;
}

function leerEntrada(crudo: unknown): Entrada {
  const parseada = entradaSchema.safeParse(comoValor(crudo));
  if (!parseada.success) return { consulta: "", categoria: null, subcategorias: [], legible: false };
  return {
    consulta: parseada.data.query,
    categoria: parseada.data.categoria ?? null,
    subcategorias: parseada.data.subcategorias ?? [],
    legible: true,
  };
}

function leerSalida(crudo: unknown): { estado: EstadoBusqueda; fragmentos: FragmentoRecuperado[] } {
  const parseada = salidaSchema.safeParse(comoValor(crudo));
  if (!parseada.success) return { estado: "ilegible", fragmentos: [] };
  const fragmentos = (parseada.data.chunks ?? [])
    .map((chunk) => ({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      section: chunk.section ?? null,
      content: chunk.content,
      similarity: chunk.similarity,
    }))
    .sort((a, b) => b.similarity - a.similarity);
  return { estado: parseada.data.status, fragmentos };
}

/**
 * Ata cada búsqueda a la respuesta que produjo.
 *
 * NO se puede agrupar por orden cronológico: el mensaje `assistant` se
 * persiste ANTES que las tool calls de su propio turno (verificado en
 * producción el 2026-08-04: mensaje 04:02:00.970, búsqueda 04:02:01.345).
 * Ordenar por reloj le asigna a cada respuesta las búsquedas de la anterior.
 * La atribución correcta sube por `parentSpanId` hasta el `agent_run` y usa
 * su ventana [startedAt, endedAt], que contiene tanto sus tool calls como el
 * mensaje del turno.
 */
export function agruparBusquedas(datos: {
  busquedas: SpanBusqueda[];
  spans: SpanLigero[];
  mensajes: MensajeAsistente[];
}): BusquedaCorpus[] {
  const porSpanId = new Map(datos.spans.map((span) => [span.spanId, span]));

  const turnoDe = (parentSpanId: string | null): SpanLigero | null => {
    let actual = parentSpanId === null ? undefined : porSpanId.get(parentSpanId);
    for (let salto = 0; actual && salto < MAX_SALTOS; salto++) {
      if (actual.spanType === "agent_run") return actual;
      actual = actual.parentSpanId === null ? undefined : porSpanId.get(actual.parentSpanId);
    }
    return null;
  };

  const respuestaDe = (turno: SpanLigero | null): string | null => {
    if (!turno) return null;
    const desde = turno.startedAt.getTime();
    const hasta = turno.endedAt ? turno.endedAt.getTime() : Number.POSITIVE_INFINITY;
    let elegido: MensajeAsistente | null = null;
    for (const mensaje of datos.mensajes) {
      const cuando = mensaje.createdAt.getTime();
      if (cuando < desde || cuando > hasta) continue;
      if (elegido === null || cuando >= elegido.createdAt.getTime()) elegido = mensaje;
    }
    return elegido === null ? null : elegido.id;
  };

  return datos.busquedas
    .map((span) => {
      const turno = turnoDe(span.parentSpanId);
      const entrada = leerEntrada(span.input);
      const salida = span.error === null || span.error === undefined
        ? leerSalida(span.output)
        : { estado: "error" as const, fragmentos: [] };
      return {
        spanId: span.spanId,
        messageId: respuestaDe(turno),
        agente: turno?.entityName ?? null,
        consulta: entrada.consulta,
        categoria: entrada.categoria,
        subcategorias: entrada.subcategorias,
        estado: entrada.legible ? salida.estado : ("ilegible" as EstadoBusqueda),
        fragmentos: salida.fragmentos,
        fecha: span.startedAt.toISOString(),
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd frontend && pnpm vitest run src/lib/revision/busquedas.test.ts
```

Esperado: PASS, 13 tests. Si falla el de "input ilegible", revisar que `estado` se fuerce a `ilegible` cuando `entrada.legible` es false, aunque la salida haya parseado bien.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/revision/busquedas.ts frontend/src/lib/revision/busquedas.test.ts
git commit -m "feat(board): atribuir cada búsqueda al turno de agente que la disparó"
```

---

### Task 3: Lectura de los spans desde la base

**Files:**
- Modify: `frontend/src/lib/revision/busquedas.ts`
- Modify: `frontend/src/lib/revision/busquedas.test.ts`

**Interfaces:**
- Consumes: `agruparBusquedas` (Task 2), `prisma` de `../prisma`.
- Produces: `construirBusquedas(threadId: string): Promise<BusquedaCorpus[]>`.

- [ ] **Step 1: Escribir el test que falla**

Al **principio** de `frontend/src/lib/revision/busquedas.test.ts`, antes de los imports del módulo, agregar el mock de Prisma (mismo patrón que `timeline.test.ts`):

```ts
const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("../prisma", () => ({ prisma: db }));
```

Agregar `beforeEach` y `vi` a los imports de vitest, e importar `construirBusquedas` junto a `agruparBusquedas`. Al final del archivo, agregar:

```ts
describe("construirBusquedas", () => {
  beforeEach(() => {
    // resetAllMocks y no clearAllMocks: clear no vacía la cola de
    // mockResolvedValueOnce, y las respuestas encoladas se filtran al
    // siguiente test.
    vi.resetAllMocks();
  });

  it("arma las búsquedas del thread a partir de las tres lecturas", async () => {
    db.$queryRaw
      .mockResolvedValueOnce([
        { spanId: "run1", parentSpanId: null, spanType: "agent_run", entityName: "laboral", startedAt: new Date("2026-08-04T10:00:00Z"), endedAt: new Date("2026-08-04T10:00:08Z") },
        { spanId: "t1", parentSpanId: "run1", spanType: "tool_call", entityName: "buscar-documentos", startedAt: new Date("2026-08-04T10:00:04Z"), endedAt: null },
      ])
      .mockResolvedValueOnce([
        {
          spanId: "t1",
          parentSpanId: "run1",
          input: { query: "indemnización por despido", categoria: "laboral", subcategorias: ["despido"] },
          output: { status: "ok", chunks: [chunk] },
          error: null,
          startedAt: new Date("2026-08-04T10:00:04Z"),
        },
      ])
      .mockResolvedValueOnce([{ id: "m1", createdAt: new Date("2026-08-04T10:00:02Z") }]);

    const busquedas = await construirBusquedas("thread-1");

    expect(busquedas).toHaveLength(1);
    expect(busquedas[0]).toMatchObject({ spanId: "t1", messageId: "m1", consulta: "indemnización por despido" });
  });

  it("un thread sin búsquedas devuelve lista vacía sin tocar el agrupador", async () => {
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(construirBusquedas("thread-vacio")).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/revision/busquedas.test.ts
```

Esperado: FAIL — `construirBusquedas is not a function`.

- [ ] **Step 3: Implementar**

En `frontend/src/lib/revision/busquedas.ts`, agregar el import de Prisma arriba (`import { prisma } from "../prisma";`) y al final del archivo:

```ts
const filaSpanLigeroSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  spanType: z.string(),
  entityName: z.string().nullable(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
});

const filaSpanBusquedaSchema = z.object({
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.unknown(),
  startedAt: z.date(),
});

const filaMensajeAsistenteSchema = z.object({ id: z.string(), createdAt: z.date() });

/**
 * Búsquedas al corpus de un thread, atadas a la respuesta que produjeron.
 *
 * Tres lecturas y no una: el árbol de spans se lee SIN payload porque un
 * thread tiene cientos de spans `model_chunk` cuyo input/output no se usa acá
 * y pesan de más; solo las filas de `buscar-documentos` traen payload.
 */
export async function construirBusquedas(threadId: string): Promise<BusquedaCorpus[]> {
  const [filasSpans, filasBusquedas, filasMensajes] = await Promise.all([
    prisma.$queryRaw`
      SELECT "spanId", "parentSpanId", "spanType", "entityName", "startedAt", "endedAt"
      FROM mastra.mastra_ai_spans
      WHERE "threadId" = ${threadId}`,
    prisma.$queryRaw`
      SELECT "spanId", "parentSpanId", input, output, error, "startedAt"
      FROM mastra.mastra_ai_spans
      WHERE "threadId" = ${threadId}
        AND "spanType" = 'tool_call'
        AND (COALESCE("entityName", name) LIKE '%buscar-documentos%')
      ORDER BY "startedAt" ASC`,
    prisma.$queryRaw`
      SELECT id, "createdAt"
      FROM mastra.mastra_messages
      WHERE thread_id = ${threadId} AND role = 'assistant'
      ORDER BY "createdAt" ASC`,
  ]);

  return agruparBusquedas({
    spans: filaSpanLigeroSchema.array().parse(filasSpans),
    busquedas: filaSpanBusquedaSchema.array().parse(filasBusquedas),
    mensajes: filaMensajeAsistenteSchema.array().parse(filasMensajes),
  });
}
```

Nota sobre el `LIKE`: el id limpio de la tool está en `entityName`, pero el `name` del span es el string envuelto `"tool: 'buscar-documentos'"`. El `COALESCE` cubre filas históricas con `entityName` nulo, igual que el `entityName ?? name` que ya hace `timeline.ts`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd frontend && pnpm vitest run src/lib/revision/busquedas.test.ts && pnpm lint
```

Esperado: PASS, 15 tests; lint limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/revision/busquedas.ts frontend/src/lib/revision/busquedas.test.ts
git commit -m "feat(board): leer del thread las búsquedas al corpus con su payload"
```

---

### Task 4: Exponer las búsquedas en el detalle del board

**Files:**
- Modify: `frontend/src/lib/board/conversaciones.ts:137-174`
- Modify: `frontend/src/lib/board/conversaciones.test.ts`

**Interfaces:**
- Consumes: `construirBusquedas` (Task 3), `BusquedaCorpus` (Task 1).
- Produces: `DetalleConversacion.busquedas: BusquedaCorpus[]`, que consumen las Tasks 6 y 9.

- [ ] **Step 1: Escribir el test que falla**

En `frontend/src/lib/board/conversaciones.test.ts`, agregar el mock del módulo nuevo junto a los otros `vi.hoisted` (arriba del `import { listarConversaciones, obtenerConversacion }`):

```ts
const busquedasMock = vi.hoisted(() => ({ construirBusquedas: vi.fn() }));
vi.mock("@/lib/revision/busquedas", () => busquedasMock);
```

En el `beforeEach` del `describe("obtenerConversacion")`, agregar:

```ts
busquedasMock.construirBusquedas.mockResolvedValue([
  { spanId: "t1", messageId: "m1", agente: "laboral", consulta: "indemnización por despido", categoria: "laboral", subcategorias: ["despido"], estado: "ok", fragmentos: [], fecha: "2026-07-30T10:00:04.000Z" },
]);
```

Y agregar el test:

```ts
it("incluye las búsquedas al corpus del thread", async () => {
  const detalle = await obtenerConversacion("c1");
  expect(busquedasMock.construirBusquedas).toHaveBeenCalledWith("chat-c1");
  expect(detalle?.busquedas).toHaveLength(1);
  expect(detalle?.busquedas[0]).toMatchObject({ messageId: "m1", consulta: "indemnización por despido" });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/board/conversaciones.test.ts
```

Esperado: FAIL — `detalle.busquedas` es `undefined`.

- [ ] **Step 3: Implementar**

En `frontend/src/lib/board/conversaciones.ts`, agregar el import:

```ts
import { construirBusquedas } from "@/lib/revision/busquedas";
import type { BusquedaCorpus } from "@/lib/revision/fuentes";
```

Agregar el campo a la interfaz:

```ts
export interface DetalleConversacion {
  id: string;
  threadId: string;
  categoria: string | null;
  fecha: string;
  timeline: ItemTimeline[];
  busquedas: BusquedaCorpus[];
  caso: CasoSnapshot | null;
  notas: NotaConRespuestas[];
}
```

Y sumarlo al `Promise.all` y al return de `obtenerConversacion`:

```ts
  const [timeline, busquedas, caso, notas] = await Promise.all([
    construirTimeline(conversacion.threadId, { conSpans: true }),
    construirBusquedas(conversacion.threadId),
    getCasoDeSesion(conversacion.id),
    listarNotasDeSesion(conversacion.id),
  ]);

  return {
    id: conversacion.id,
    threadId: conversacion.threadId,
    categoria: conversacion.categoria,
    fecha: conversacion.createdAt.toISOString(),
    timeline,
    busquedas,
    caso,
    notas,
  };
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
cd frontend && pnpm vitest run src/lib/board/conversaciones.test.ts && pnpm typecheck
```

Esperado: PASS; typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/board/conversaciones.ts frontend/src/lib/board/conversaciones.test.ts
git commit -m "feat(board): exponer las búsquedas al corpus en el detalle de la conversación"
```

---

### Task 5: Componente `PanelFuentes`

**Files:**
- Create: `frontend/src/components/revision/PanelFuentes.tsx`
- Create: `frontend/src/components/revision/fuentes.module.css`
- Test: `frontend/src/components/revision/PanelFuentes.test.tsx`

**Interfaces:**
- Consumes: `BusquedaCorpus`, `citaDeBusqueda`, `citaDeFragmento`, `textoDelMapa` (Task 1).
- Produces: `<PanelFuentes busquedas={...} messageIdSeleccionado={...} onIrARespuesta={...} onAnotar={...} />`, que montan las Tasks 6 y 8.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/components/revision/PanelFuentes.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BusquedaCorpus } from "@/lib/revision/fuentes";

import { PanelFuentes } from "./PanelFuentes";

const fragmento = {
  documentId: "d1",
  documentTitle: "Ley 10.489",
  section: "art. 4",
  content: "El empleador que despida sin causa deberá abonar una indemnización.",
  similarity: 0.7912,
};

function busqueda(sobreescribir: Partial<BusquedaCorpus> = {}): BusquedaCorpus {
  return {
    spanId: "t1",
    messageId: "m1",
    agente: "laboral",
    consulta: "indemnización por despido antigüedad",
    categoria: "laboral",
    subcategorias: ["despido"],
    estado: "ok",
    fragmentos: [fragmento],
    fecha: "2026-08-04T10:00:00.000Z",
    ...sobreescribir,
  };
}

describe("PanelFuentes", () => {
  it("sin búsquedas dice que el chat no consultó el corpus", () => {
    render(<PanelFuentes busquedas={[]} messageIdSeleccionado={null} onIrARespuesta={vi.fn()} onAnotar={vi.fn()} />);
    expect(screen.getByText("Este chat no consultó el corpus.")).toBeInTheDocument();
  });

  it("sin respuesta seleccionada muestra el mapa con el contador y las vacías", () => {
    const onIrARespuesta = vi.fn();
    render(
      <PanelFuentes
        busquedas={[busqueda(), busqueda({ spanId: "t2", messageId: "m3", consulta: "despido en licencia médica", estado: "empty", fragmentos: [] })]}
        messageIdSeleccionado={null}
        onIrARespuesta={onIrARespuesta}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getByText("1 de 2 consultas volvió sin fuentes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /despido en licencia médica/ }));
    expect(onIrARespuesta).toHaveBeenCalledWith("m3");
  });

  it("con una respuesta seleccionada muestra su consulta y sus fragmentos con score", () => {
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onIrARespuesta={vi.fn()} onAnotar={vi.fn()} />,
    );
    expect(screen.getByText("indemnización por despido antigüedad")).toBeInTheDocument();
    expect(screen.getByText("Ley 10.489 — art. 4")).toBeInTheDocument();
    expect(screen.getByText("0.79")).toBeInTheDocument();
  });

  it("una búsqueda vacía nombra la categoría y NO muestra el número del umbral", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda({ estado: "empty", fragmentos: [] })]}
        messageIdSeleccionado="m1"
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    const alerta = screen.getByRole("status");
    expect(alerta).toHaveTextContent("ningún fragmento del corpus de laboral superó el umbral de relevancia");
    expect(alerta.textContent).not.toMatch(/0\.\d/);
  });

  it("una búsqueda ilegible lo dice sin romper la lista", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda({ estado: "ilegible", fragmentos: [] }), busqueda({ spanId: "t2" })]}
        messageIdSeleccionado="m1"
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getByText(/No pudimos leer el resultado de esta búsqueda/)).toBeInTheDocument();
    expect(screen.getByText("Ley 10.489 — art. 4")).toBeInTheDocument();
  });

  it("un fragmento largo se recorta y se expande con ver más", () => {
    const largo = { ...fragmento, content: `${"a".repeat(500)}FINAL` };
    render(
      <PanelFuentes
        busquedas={[busqueda({ fragmentos: [largo] })]}
        messageIdSeleccionado="m1"
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.queryByText(/FINAL/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));
    expect(screen.getByText(/FINAL/)).toBeInTheDocument();
  });

  it("anotar una búsqueda manda la consulta como cita", () => {
    const onAnotar = vi.fn();
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onIrARespuesta={vi.fn()} onAnotar={onAnotar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dejar nota sobre esta búsqueda" }));
    expect(onAnotar).toHaveBeenCalledWith("m1", "Búsqueda: «indemnización por despido antigüedad»");
  });

  it("anotar un fragmento manda documento, sección y score como cita", () => {
    const onAnotar = vi.fn();
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onIrARespuesta={vi.fn()} onAnotar={onAnotar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dejar nota sobre este fragmento" }));
    expect(onAnotar).toHaveBeenCalledWith(
      "m1",
      "Ley 10.489 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("una respuesta sin búsquedas lo dice y deja volver al mapa", () => {
    const onIrARespuesta = vi.fn();
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m9" onIrARespuesta={onIrARespuesta} onAnotar={vi.fn()} />,
    );
    expect(screen.getByText("Esta respuesta no consultó el corpus.")).toBeInTheDocument();
  });

  it("las búsquedas huérfanas aparecen en el mapa marcadas", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda({ messageId: null })]}
        messageIdSeleccionado={null}
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getByText("sin respuesta asociada")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/components/revision/PanelFuentes.test.tsx
```

Esperado: FAIL — `Failed to resolve import "./PanelFuentes"`.

- [ ] **Step 3: Implementar el componente**

Crear `frontend/src/components/revision/PanelFuentes.tsx`:

```tsx
"use client";

import { useState } from "react";

import {
  citaDeBusqueda,
  citaDeFragmento,
  textoDelMapa,
  type BusquedaCorpus,
  type FragmentoRecuperado,
} from "@/lib/revision/fuentes";

import styles from "./fuentes.module.css";

/** Largo del recorte de un fragmento antes de "Ver más". */
const RECORTE = 400;

interface PanelFuentesProps {
  busquedas: BusquedaCorpus[];
  /** Respuesta seleccionada; null muestra el mapa de todo el chat. */
  messageIdSeleccionado: string | null;
  /** Clic en una línea del mapa: el padre selecciona esa respuesta. */
  onIrARespuesta: (messageId: string) => void;
  onAnotar: (messageId: string | null, cita: string) => void;
}

function Fragmento({
  fragmento,
  onAnotar,
}: {
  fragmento: FragmentoRecuperado;
  onAnotar: () => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const largo = fragmento.content.length > RECORTE;
  const texto = expandido || !largo ? fragmento.content : `${fragmento.content.slice(0, RECORTE)}…`;

  return (
    <article className={styles.fragmento}>
      <header className={styles.fragmentoMeta}>
        <span>{fragmento.section ? `${fragmento.documentTitle} — ${fragmento.section}` : fragmento.documentTitle}</span>
        <span className={styles.score}>
          <span className={styles.barra} aria-hidden="true">
            <span style={{ width: `${String(Math.round(fragmento.similarity * 100))}%` }} />
          </span>
          {fragmento.similarity.toFixed(2)}
        </span>
      </header>
      <p className={styles.fragmentoTexto}>{texto}</p>
      <div className={styles.filaAcciones}>
        {largo ? (
          <button type="button" className={styles.botonChico} onClick={() => setExpandido(!expandido)}>
            {expandido ? "Ver menos" : "Ver más"}
          </button>
        ) : null}
        <button type="button" className={styles.botonChico} onClick={onAnotar}>
          Dejar nota sobre este fragmento
        </button>
      </div>
    </article>
  );
}

function Busqueda({
  busqueda,
  onAnotar,
}: {
  busqueda: BusquedaCorpus;
  onAnotar: (messageId: string | null, cita: string) => void;
}) {
  const filtros = [busqueda.categoria, ...busqueda.subcategorias].filter(Boolean).join(" · ");

  return (
    <section className={styles.busqueda}>
      <p className={styles.etiqueta}>Consulta del agente</p>
      <p className={styles.consulta}>{busqueda.consulta}</p>
      {filtros ? <p className={styles.filtros}>{filtros}</p> : null}

      {busqueda.estado === "ok" ? (
        busqueda.fragmentos.map((fragmento) => (
          <Fragmento
            key={fragmento.documentId + String(fragmento.similarity)}
            fragmento={fragmento}
            onAnotar={() => onAnotar(busqueda.messageId, citaDeFragmento(fragmento))}
          />
        ))
      ) : (
        <p role="status" className={styles.aviso}>
          {busqueda.estado === "empty"
            ? `Sin resultados: ningún fragmento del corpus de ${busqueda.categoria ?? "esta categoría"} superó el umbral de relevancia.`
            : busqueda.estado === "error"
              ? "La búsqueda falló: el agente respondió sin fuentes del corpus."
              : "No pudimos leer el resultado de esta búsqueda (formato desconocido)."}
        </p>
      )}

      <button
        type="button"
        className={styles.botonChico}
        onClick={() => onAnotar(busqueda.messageId, citaDeBusqueda(busqueda))}
      >
        Dejar nota sobre esta búsqueda
      </button>
    </section>
  );
}

export function PanelFuentes({ busquedas, messageIdSeleccionado, onIrARespuesta, onAnotar }: PanelFuentesProps) {
  if (busquedas.length === 0) {
    return <p className={styles.vacio}>Este chat no consultó el corpus.</p>;
  }

  if (messageIdSeleccionado === null) {
    return (
      <div className={styles.mapa}>
        <p className={styles.contador}>{textoDelMapa(busquedas)}</p>
        <ul className={styles.listaMapa}>
          {busquedas.map((busqueda) => (
            <li key={busqueda.spanId}>
              <button
                type="button"
                className={busqueda.estado === "ok" ? styles.lineaMapa : styles.lineaMapaVacia}
                disabled={busqueda.messageId === null}
                onClick={() => {
                  if (busqueda.messageId !== null) onIrARespuesta(busqueda.messageId);
                }}
              >
                <span className={styles.consultaMapa}>{busqueda.consulta || "(consulta ilegible)"}</span>
                <span className={styles.etiqueta}>
                  {busqueda.messageId === null
                    ? "sin respuesta asociada"
                    : busqueda.estado === "ok"
                      ? `${String(busqueda.fragmentos.length)} · ${(busqueda.fragmentos[0]?.similarity ?? 0).toFixed(2)}`
                      : "sin resultados"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const deLaRespuesta = busquedas.filter((busqueda) => busqueda.messageId === messageIdSeleccionado);
  if (deLaRespuesta.length === 0) {
    return <p className={styles.vacio}>Esta respuesta no consultó el corpus.</p>;
  }

  return (
    <div className={styles.detalle}>
      {deLaRespuesta.map((busqueda) => (
        <Busqueda key={busqueda.spanId} busqueda={busqueda} onAnotar={onAnotar} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Crear los estilos**

Crear `frontend/src/components/revision/fuentes.module.css`:

```css
.vacio,
.contador,
.etiqueta {
  font-size: var(--text-xs);
  color: var(--ink-500);
}

.mapa,
.detalle {
  display: grid;
  gap: var(--space-3);
}

.listaMapa {
  list-style: none;
  display: grid;
  gap: var(--space-2);
}

.lineaMapa,
.lineaMapaVacia {
  font: inherit;
  font-size: var(--text-xs);
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  text-align: left;
  padding: var(--space-2);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink-700);
  cursor: pointer;
}

.lineaMapaVacia {
  border-color: var(--warning-border, var(--ink-300));
  background: var(--warning-soft, var(--surface));
}

.consultaMapa {
  flex: 1;
  min-width: 0;
}

.busqueda {
  display: grid;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--ink-100);
}

.consulta {
  font-size: var(--text-sm);
  color: var(--ink-900);
}

.filtros {
  font-size: var(--text-xs);
  color: var(--ink-500);
}

.fragmento {
  border-left: 3px solid var(--accent, var(--ink-300));
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
}

.fragmentoMeta {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--ink-500);
}

.fragmentoTexto {
  font-size: var(--text-sm);
  color: var(--ink-700);
  margin-top: var(--space-1);
}

.score {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-variant-numeric: tabular-nums;
}

.barra {
  display: inline-block;
  width: 2rem;
  height: 0.3rem;
  border-radius: var(--radius-sm);
  background: var(--ink-100);
}

.barra span {
  display: block;
  height: 100%;
  border-radius: var(--radius-sm);
  background: var(--accent, var(--ink-500));
}

.aviso {
  font-size: var(--text-sm);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--warning-border, var(--ink-300));
  background: var(--warning-soft, var(--surface));
  color: var(--ink-700);
}

.filaAcciones {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-top: var(--space-2);
}

.botonChico {
  font: inherit;
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--ink-300);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-700);
  cursor: pointer;
}
```

Antes de darlo por bueno, verificar que los tokens usados existan en el CSS global del proyecto (`grep -rn "\-\-warning-soft\|--accent" frontend/src/app/globals.css frontend/src/styles 2>/dev/null`). Si `--warning-soft` / `--warning-border` / `--accent` no existen, definirlos en el mismo lugar donde viven los otros tokens Jurco, o usar el fallback ya declarado en cada `var(...)`.

- [ ] **Step 5: Correr el test y verificar que pasa**

```bash
cd frontend && pnpm vitest run src/components/revision/PanelFuentes.test.tsx && pnpm lint
```

Esperado: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/revision/PanelFuentes.tsx frontend/src/components/revision/fuentes.module.css frontend/src/components/revision/PanelFuentes.test.tsx
git commit -m "feat(board): componente de fuentes recuperadas del corpus"
```

---

### Task 6: Marca, selección y solapas en el detalle del chat

**Files:**
- Modify: `frontend/src/components/board/Chats/DetalleChat.tsx`
- Modify: `frontend/src/components/board/Chats/chats.module.css`

**Interfaces:**
- Consumes: `DetalleConversacion.busquedas` (Task 4), `PanelFuentes` (Task 5), `resumirPorRespuesta`/`textoDeMarca` (Task 1).
- Produces: la pantalla que verifica la Task 9.

- [ ] **Step 1: Agregar estado, marca y selección**

En `frontend/src/components/board/Chats/DetalleChat.tsx`, agregar imports:

```tsx
import { PanelFuentes } from "@/components/revision/PanelFuentes";
import { resumirPorRespuesta, textoDeMarca } from "@/lib/revision/fuentes";
```

Agregar estado junto al `anotando` existente:

```tsx
  const [solapa, setSolapa] = useState<"fuentes" | "caso" | "notas">("fuentes");
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
```

Después del guard de carga (`if (isLoading || !data) …`), calcular el resumen:

```tsx
  const resumenes = resumirPorRespuesta(data.busquedas);
```

En el `map` de la timeline, reemplazar el bloque de `item.tipo === "mensaje"` por:

```tsx
            if (item.tipo === "mensaje") {
              const resumen = item.rol === "assistant" ? resumenes.get(item.id) : undefined;
              const esSeleccionada = seleccionada === item.id;
              return (
                <li
                  key={item.id}
                  className={item.rol === "user" ? styles.mensajeUsuario : styles.mensajeAgente}
                  aria-current={esSeleccionada ? "true" : undefined}
                  data-seleccionada={esSeleccionada ? "true" : undefined}
                >
                  {item.rol === "assistant" ? (
                    <button
                      type="button"
                      className={styles.mensajeBoton}
                      onClick={() => {
                        setSeleccionada(item.id);
                        setSolapa("fuentes");
                      }}
                    >
                      {item.texto}
                    </button>
                  ) : (
                    <p>{item.texto}</p>
                  )}
                  {resumen ? (
                    <p className={resumen.vacias > 0 ? styles.marcaAlerta : styles.marca}>{textoDeMarca(resumen)}</p>
                  ) : null}
                  <button
                    type="button"
                    className={styles.botonNota}
                    onClick={() => setAnotando({ messageId: item.id, cita: item.texto.slice(0, 300) })}
                  >
                    Dejar nota
                  </button>
                </li>
              );
            }
```

- [ ] **Step 2: Reemplazar el panel lateral por las solapas**

Sustituir el `<aside className={styles.panel}>` completo por:

```tsx
      <aside className={styles.panel}>
        <div className={styles.solapas} role="tablist" aria-label="Detalle de la conversación">
          <button
            type="button"
            role="tab"
            aria-selected={solapa === "fuentes"}
            className={solapa === "fuentes" ? styles.solapaActiva : styles.solapa}
            onClick={() => setSolapa("fuentes")}
          >
            Fuentes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={solapa === "caso"}
            className={solapa === "caso" ? styles.solapaActiva : styles.solapa}
            onClick={() => setSolapa("caso")}
          >
            Caso
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={solapa === "notas"}
            className={solapa === "notas" ? styles.solapaActiva : styles.solapa}
            onClick={() => setSolapa("notas")}
          >
            Notas ({data.notas.length})
          </button>
        </div>

        {solapa === "fuentes" ? (
          <section className={styles.bloqueLateral}>
            {seleccionada !== null ? (
              <button type="button" className={styles.botonNota} onClick={() => setSeleccionada(null)}>
                Ver todas las consultas
              </button>
            ) : null}
            <PanelFuentes
              busquedas={data.busquedas}
              messageIdSeleccionado={seleccionada}
              onIrARespuesta={(messageId) => setSeleccionada(messageId)}
              onAnotar={(messageId, cita) => {
                setAnotando({ messageId, cita });
                setSolapa("notas");
              }}
            />
          </section>
        ) : null}

        {solapa === "caso" ? (
          <section className={styles.bloqueLateral}>
            <h2 className={styles.subtitulo}>Caso</h2>
            {/* el <dl> del caso queda igual que hoy */}
          </section>
        ) : null}

        {solapa === "notas" ? (
          <section className={styles.bloqueLateral}>
            {/* el composer y el listado de notas quedan igual que hoy */}
          </section>
        ) : null}
      </aside>
```

Mantener intacto el contenido de los bloques `Caso` y `Notas` (el `<dl>`, el `NotaComposer` y el `map` de `NotaThread`): solo se mueven adentro de su condicional de solapa.

- [ ] **Step 3: Agregar los estilos**

Agregar al final de `frontend/src/components/board/Chats/chats.module.css`, antes del `@media`:

```css
.solapas {
  display: flex;
  gap: var(--space-1);
}

.solapa,
.solapaActiva {
  font: inherit;
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: transparent;
  color: var(--ink-500);
  cursor: pointer;
}

.solapaActiva {
  border-color: var(--ink-100);
  background: var(--surface);
  color: var(--ink-900);
}

.mensajeBoton {
  font: inherit;
  text-align: left;
  width: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.mensajeAgente[data-seleccionada="true"] {
  border-color: var(--ink-500);
}

.marca,
.marcaAlerta {
  font-size: var(--text-xs);
  color: var(--ink-500);
  margin-top: var(--space-2);
}

.marcaAlerta {
  color: var(--warning-ink, var(--ink-900));
  font-weight: 600;
}
```

- [ ] **Step 4: Verificar en el navegador**

```bash
cd frontend && pnpm dev
```

Abrir `/board/chats`, entrar a un chat con búsquedas y comprobar: la marca aparece bajo las respuestas del agente; el clic abre `Fuentes` con las consultas de esa respuesta; "Ver todas las consultas" vuelve al mapa; el clic en una línea del mapa selecciona la respuesta; "Dejar nota sobre este fragmento" salta a `Notas` con la cita cargada.

- [ ] **Step 5: Correr checks y commitear**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit
git add frontend/src/components/board/Chats/DetalleChat.tsx frontend/src/components/board/Chats/chats.module.css
git commit -m "feat(board): solapa de fuentes y marca de consultas por respuesta"
```

---

### Task 7: Timeline limpia y resumen técnico

**Files:**
- Create: `frontend/src/lib/board/tecnico.ts`
- Test: `frontend/src/lib/board/tecnico.test.ts`
- Modify: `frontend/src/components/board/Chats/DetalleChat.tsx`

**Interfaces:**
- Consumes: `ItemTimeline` de `@/lib/revision/timeline`, `estimarCostoUsd` de `@/lib/board/costos`.
- Produces: `resumirTecnico(timeline): ResumenTecnico`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/lib/board/tecnico.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ItemTimeline } from "@/lib/revision/timeline";

import { resumirTecnico } from "./tecnico";

const timeline: ItemTimeline[] = [
  { tipo: "mensaje", id: "m1", rol: "user", texto: "hola", fecha: "2026-08-04T10:00:00.000Z" },
  { tipo: "turno-agente", spanId: "run1", agente: "recepcion", fecha: "2026-08-04T10:00:01.000Z" },
  { tipo: "turno-agente", spanId: "run2", agente: "laboral", fecha: "2026-08-04T10:00:02.000Z" },
  { tipo: "tool-call", spanId: "t1", tool: "buscar-documentos", agente: "laboral", input: null, output: null, error: null, fecha: "2026-08-04T10:00:03.000Z" },
  { tipo: "tool-call", spanId: "t2", tool: "registrar-caso", agente: "laboral", input: null, output: null, error: null, fecha: "2026-08-04T10:00:04.000Z" },
  { tipo: "tool-call", spanId: "t3", tool: "updateWorkingMemory", agente: "laboral", input: null, output: null, error: null, fecha: "2026-08-04T10:00:05.000Z" },
  { tipo: "generacion", spanId: "g1", modelo: "openai/gpt-5.6-luna", tokensEntrada: 1000, tokensSalida: 500, fecha: "2026-08-04T10:00:06.000Z" },
];

describe("resumirTecnico", () => {
  it("junta agentes, modelos y tokens sin repetir", () => {
    const resumen = resumirTecnico([...timeline, { tipo: "generacion", spanId: "g2", modelo: "openai/gpt-5.6-luna", tokensEntrada: 200, tokensSalida: 100, fecha: "2026-08-04T10:00:07.000Z" }]);
    expect(resumen.agentes).toEqual(["recepcion", "laboral"]);
    expect(resumen.modelos).toEqual(["openai/gpt-5.6-luna"]);
    expect(resumen.tokensEntrada).toBe(1200);
    expect(resumen.tokensSalida).toBe(600);
  });

  it("deja fuera buscar-documentos (tiene su propia solapa) y el ruido interno de Mastra", () => {
    expect(resumirTecnico(timeline).tools).toEqual([{ tool: "registrar-caso", agente: "laboral", conError: false }]);
  });

  it("estima el costo con la tabla del board", () => {
    // gpt-5.6-luna: 0.2 USD/M entrada, 1.2 USD/M salida.
    expect(resumirTecnico(timeline).costoUsd).toBeCloseTo(0.0008, 6);
  });

  it("un modelo sin precio deja el costo en null, no en cero", () => {
    // Reportar 0 para un modelo desconocido esconde justo el evento que interesa ver.
    const conDesconocido: ItemTimeline[] = [
      ...timeline,
      { tipo: "generacion", spanId: "g9", modelo: "modelo-nuevo-sin-precio", tokensEntrada: 10, tokensSalida: 10, fecha: "2026-08-04T10:00:08.000Z" },
    ];
    expect(resumirTecnico(conDesconocido).costoUsd).toBeNull();
  });

  it("una timeline sin spans devuelve un resumen vacío y costo cero", () => {
    const resumen = resumirTecnico([timeline[0]!]);
    expect(resumen).toMatchObject({ agentes: [], modelos: [], tokensEntrada: 0, tokensSalida: 0, tools: [], costoUsd: 0 });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run src/lib/board/tecnico.test.ts
```

Esperado: FAIL — `Failed to resolve import "./tecnico"`.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/board/tecnico.ts`:

```ts
import type { ItemTimeline } from "@/lib/revision/timeline";

import { estimarCostoUsd } from "./costos";

/** Tools que no van al resumen: la del corpus tiene su propia solapa; la otra es ruido interno de Mastra. */
const TOOLS_OCULTAS = new Set(["buscar-documentos", "updateWorkingMemory"]);

export interface ToolResumida {
  tool: string;
  agente: string | null;
  conError: boolean;
}

export interface ResumenTecnico {
  agentes: string[];
  modelos: string[];
  tokensEntrada: number;
  tokensSalida: number;
  /** null cuando algún modelo no tiene precio en la tabla: reportar 0 escondería el caso. */
  costoUsd: number | null;
  tools: ToolResumida[];
}

export function resumirTecnico(timeline: ItemTimeline[]): ResumenTecnico {
  const agentes: string[] = [];
  const modelos: string[] = [];
  const tools: ToolResumida[] = [];
  let tokensEntrada = 0;
  let tokensSalida = 0;
  let costoUsd: number | null = 0;

  for (const item of timeline) {
    if (item.tipo === "turno-agente") {
      if (!agentes.includes(item.agente)) agentes.push(item.agente);
    } else if (item.tipo === "tool-call") {
      if (TOOLS_OCULTAS.has(item.tool)) continue;
      tools.push({ tool: item.tool, agente: item.agente, conError: item.error !== null && item.error !== undefined });
    } else if (item.tipo === "generacion") {
      tokensEntrada += item.tokensEntrada;
      tokensSalida += item.tokensSalida;
      if (item.modelo !== null && !modelos.includes(item.modelo)) modelos.push(item.modelo);
      const parcial = item.modelo === null ? null : estimarCostoUsd(item.modelo, item.tokensEntrada, item.tokensSalida);
      costoUsd = costoUsd === null || parcial === null ? null : costoUsd + parcial;
    }
  }

  return { agentes, modelos, tokensEntrada, tokensSalida, costoUsd, tools };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd frontend && pnpm vitest run src/lib/board/tecnico.test.ts
```

Esperado: PASS, 5 tests.

- [ ] **Step 5: Sacar las trazas de la timeline y mostrar el resumen**

En `DetalleChat.tsx`, importar `resumirTecnico` y calcular `const tecnico = resumirTecnico(data.timeline);`.

En el `map` de la timeline, borrar las tres ramas que renderizan trazas (`item.tipo === "tool-call"`, `"turno-agente"` y el `return` final de generación) y dejar solo mensajes:

```tsx
        <ol className={styles.timeline}>
          {data.timeline.map((item) => {
            if (item.tipo !== "mensaje") return null;
            /* … el <li> del mensaje, tal como quedó en la Task 6 … */
          })}
        </ol>
```

Dentro de la solapa `Caso`, después del `<dl>`, agregar el bloque plegado:

```tsx
            <details className={styles.tecnico}>
              <summary>Detalle técnico</summary>
              <dl className={styles.datos}>
                <dt>Agentes</dt>
                <dd>{tecnico.agentes.join(" · ") || "—"}</dd>
                <dt>Modelos</dt>
                <dd>{tecnico.modelos.join(" · ") || "—"}</dd>
                <dt>Tokens</dt>
                <dd>
                  {tecnico.tokensEntrada} entrada / {tecnico.tokensSalida} salida
                </dd>
                <dt>Costo estimado</dt>
                <dd>{tecnico.costoUsd === null ? "sin dato" : `US$ ${tecnico.costoUsd.toFixed(4)}`}</dd>
                <dt>Otras herramientas</dt>
                <dd>
                  {tecnico.tools.length === 0
                    ? "—"
                    : tecnico.tools.map((tool) => `${tool.tool}${tool.conError ? " (con error)" : ""}`).join(" · ")}
                </dd>
              </dl>
            </details>
```

Agregar el estilo en `chats.module.css`:

```css
.tecnico {
  margin-top: var(--space-3);
  font-size: var(--text-xs);
  color: var(--ink-500);
}

.tecnico summary {
  cursor: pointer;
}
```

- [ ] **Step 6: Correr checks y commitear**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit
git add frontend/src/lib/board/tecnico.ts frontend/src/lib/board/tecnico.test.ts frontend/src/components/board/Chats/DetalleChat.tsx frontend/src/components/board/Chats/chats.module.css
git commit -m "feat(board): timeline sin trazas técnicas y resumen plegado en el panel"
```

---

### Task 8: Las mismas fuentes en la vista de revisión

**Files:**
- Modify: `frontend/src/app/api/revision/sesiones/[id]/route.ts:20-36`
- Modify: `frontend/src/app/api/revision/sesiones/[id]/route.test.ts`
- Modify: `frontend/src/components/revision/SesionView.tsx`
- Modify: `frontend/src/components/revision/revision.module.css`

**Interfaces:**
- Consumes: `construirBusquedas` (Task 3), `PanelFuentes` (Task 5), `resumirPorRespuesta`/`textoDeMarca` (Task 1).
- Produces: el campo `busquedas` en la respuesta de `GET /api/revision/sesiones/:id`.

- [ ] **Step 1: Escribir el test que falla**

En `frontend/src/app/api/revision/sesiones/[id]/route.test.ts`, agregar el mock del módulo (junto a los mocks existentes) y el test:

```ts
const busquedasMock = vi.hoisted(() => ({ construirBusquedas: vi.fn() }));
vi.mock("@/lib/revision/busquedas", () => busquedasMock);
```

```ts
it("devuelve las búsquedas al corpus de la sesión", async () => {
  busquedasMock.construirBusquedas.mockResolvedValue([
    { spanId: "t1", messageId: "m1", agente: "laboral", consulta: "despido", categoria: "laboral", subcategorias: [], estado: "ok", fragmentos: [], fecha: "2026-08-04T10:00:00.000Z" },
  ]);
  const response = await GET(new Request("http://localhost/api/revision/sesiones/s1"), { params: Promise.resolve({ id: "s1" }) });
  const cuerpo = (await response.json()) as { busquedas: unknown[] };
  expect(cuerpo.busquedas).toHaveLength(1);
});
```

Ajustar el nombre de los mocks existentes del archivo si difieren (leerlo antes de editar; el resto del setup —`getIdentidadBoard`, `getSesionRevision`— ya está armado ahí).

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd frontend && pnpm vitest run "src/app/api/revision/sesiones/[id]/route.test.ts"
```

Esperado: FAIL — `cuerpo.busquedas` es `undefined`.

- [ ] **Step 3: Implementar el endpoint**

En `frontend/src/app/api/revision/sesiones/[id]/route.ts`:

```ts
import { construirBusquedas } from "@/lib/revision/busquedas";
```

```ts
    const [timeline, busquedas, notas, caso] = await Promise.all([
      construirTimeline(sesion.threadId),
      construirBusquedas(sesion.threadId),
      listarNotasDeSesion(sesion.id),
      getCasoDeSesion(sesion.id),
    ]);
```

Y agregar `busquedas` al objeto del `NextResponse.json`.

Nota: la timeline de esta vista sigue **sin** spans (`construirTimeline(sesion.threadId)` sin opciones). Las búsquedas ya no vienen de ahí, así que no hay razón para engordar ese payload.

- [ ] **Step 4: Montar el panel en `SesionView`**

En `frontend/src/components/revision/SesionView.tsx`, agregar imports:

```tsx
import { resumirPorRespuesta, textoDeMarca, type BusquedaCorpus } from "@/lib/revision/fuentes";

import { PanelFuentes } from "./PanelFuentes";
```

Agregar al tipo del detalle que consume el componente el campo `busquedas: BusquedaCorpus[]` (mismo lugar donde hoy declara `timeline` y `notas`), y estado local:

```tsx
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const busquedas = detalle?.busquedas ?? [];
  const resumenes = resumirPorRespuesta(busquedas);
```

Bajo cada `MessageBubble` de rol `assistant`, agregar la marca y hacerla seleccionable. Dentro del `map` de mensajes, antes del `return`, calcular `const resumen = mensaje.rol === "assistant" ? resumenes.get(mensaje.id) : undefined;` y renderizar:

```tsx
              {resumen ? (
                <button
                  type="button"
                  className={styles.marcaFuentes}
                  onClick={() => setSeleccionada(mensaje.id)}
                >
                  {textoDeMarca(resumen)}
                </button>
              ) : null}
```

Y agregar el panel como columna al costado del `<section aria-label="Conversación de prueba">`, envolviendo ambos en un contenedor:

```tsx
        <div className={styles.columnas}>
          <section aria-label="Conversación de prueba" className={styles.chatColumna} ref={chatRef} onMouseUp={handleMouseUp}>
            {/* … el contenido actual … */}
          </section>
          <aside className={styles.columnaFuentes} aria-label="Fuentes del corpus">
            {seleccionada !== null ? (
              <button type="button" className={styles.botonSecundario} onClick={() => setSeleccionada(null)}>
                Ver todas las consultas
              </button>
            ) : null}
            <PanelFuentes
              busquedas={busquedas}
              messageIdSeleccionado={seleccionada}
              onIrARespuesta={(messageId) => setSeleccionada(messageId)}
              onAnotar={(messageId, cita) => abrirComposer(messageId, cita)}
            />
          </aside>
        </div>
```

`abrirComposer(messageId, cita)` ya existe en el componente con esa firma; si el `messageId` viene `null` (búsqueda huérfana), cae en el composer de nota general, que es el comportamiento correcto.

Agregar a `revision.module.css`:

```css
.columnas {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22rem;
  gap: var(--space-6);
  align-items: start;
}

.columnaFuentes {
  display: grid;
  gap: var(--space-3);
  position: sticky;
  top: var(--space-6);
}

.marcaFuentes {
  font: inherit;
  font-size: var(--text-xs);
  color: var(--ink-500);
  border: 0;
  background: transparent;
  padding: 0;
  margin-top: var(--space-1);
  cursor: pointer;
}

@media (width <= 60rem) {
  .columnas {
    grid-template-columns: 1fr;
  }

  .columnaFuentes {
    position: static;
  }
}
```

- [ ] **Step 5: Verificar en el navegador**

Con el backend Mastra corriendo, abrir `/revision`, entrar a una sesión con búsquedas y comprobar que la marca aparece y el panel carga. En una sesión **en vivo** (turno recién enviado), la marca puede tardar un instante en aparecer: los spans se escriben después del stream y llegan con el refetch. No agregar polling por esto.

- [ ] **Step 6: Correr checks y commitear**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit
git add frontend/src/app/api/revision frontend/src/components/revision/SesionView.tsx frontend/src/components/revision/revision.module.css
git commit -m "feat(revision): mostrar las fuentes del corpus en la sesión de revisión"
```

---

### Task 9: E2E del recorrido completo

**Files:**
- Modify: `frontend/tests/board.spec.ts`

**Interfaces:**
- Consumes: la pantalla de las Tasks 6 y 7.
- Produces: nada.

- [ ] **Step 1: Escribir el test**

Agregar al final de `frontend/tests/board.spec.ts`:

```ts
test("el detalle del chat muestra las fuentes del corpus", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board/chats");
  const filas = page.locator("tbody tr");
  const vacio = page.getByText("No hay conversaciones en este rango.");
  await expect(filas.first().or(vacio)).toBeVisible({ timeout: 30_000 });
  if (await vacio.isVisible()) test.skip(true, "Sin conversaciones reales en la base de prueba");

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/chats\/.+/);

  // La solapa Fuentes arranca en el mapa del chat: o hay consultas, o el
  // chat no consultó el corpus. Las dos son respuestas válidas; lo que no
  // puede pasar es que la solapa quede en blanco.
  const sinCorpus = page.getByText("Este chat no consultó el corpus.");
  const mapa = page.getByText(/consultas?(,| ).*fuentes/);
  await expect(sinCorpus.or(mapa)).toBeVisible({ timeout: 15_000 });
  if (await sinCorpus.isVisible()) test.skip(true, "El chat de prueba no consultó el corpus");

  // Clic en una respuesta del agente: la solapa carga sus consultas.
  await page.locator("[data-seleccionada], li").filter({ hasText: /consultas? ·/ }).first().click();
  await expect(page.getByText("Consulta del agente").first()).toBeVisible();

  // Las otras dos solapas siguen accesibles.
  await page.getByRole("tab", { name: "Caso" }).click();
  await expect(page.getByRole("heading", { name: "Caso" })).toBeVisible();
  await page.getByRole("tab", { name: /Notas/ }).click();
  await expect(page.getByRole("button", { name: "Nota sobre la conversación" })).toBeVisible();
});
```

- [ ] **Step 2: Correr el E2E**

Con el backend Mastra corriendo (`cd backend && pnpm dev`) y el frontend en dev:

```bash
cd frontend && pnpm test -- board.spec.ts
```

Esperado: PASS, o `skip` con motivo explícito si la base de prueba no tiene chats con búsquedas.

- [ ] **Step 3: Correr la suite completa**

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit
```

Esperado: todo verde.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/board.spec.ts
git commit -m "test(board): E2E de las fuentes del corpus en el detalle del chat"
```

---

### Task 10: Documentar el gotcha de atribución

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/guia-codificacion-frontend.md`

- [ ] **Step 1: Agregar el gotcha a CLAUDE.md**

En la lista de gotchas del board (bloque "Gotchas del board (2026-08-01)"), agregar al final:

```
; el mensaje `assistant` de `mastra_messages` se persiste ANTES que las tool calls de su propio turno (verificado 2026-08-04: mensaje 04:02:00.970, búsqueda 04:02:01.345), así que atribuir spans a mensajes por orden cronológico corre todo un turno — la atribución correcta sube por `parentSpanId` hasta el `agent_run` y usa su ventana `[startedAt, endedAt]`, que contiene tanto sus tool calls como el mensaje del turno (`frontend/src/lib/revision/busquedas.ts`)
```

- [ ] **Step 2: Anotarlo también en la guía de frontend**

Agregar el mismo hecho, con una frase de contexto, a la sección de gotchas de `docs/guia-codificacion-frontend.md`, apuntando a `busquedas.ts` como la implementación de referencia.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/guia-codificacion-frontend.md
git commit -m "docs: registrar el gotcha de atribución de spans a mensajes"
```

---

## Verificación final

```bash
cd frontend && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test
```

Y una pasada manual sobre `/board/chats/[id]` con un chat real que tenga al menos una búsqueda vacía, para confirmar que el hueco de corpus se ve sin abrir nada.
