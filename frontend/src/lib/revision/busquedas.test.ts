import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("../prisma", () => ({ prisma: db }));

import { agruparBusquedas, construirBusquedas, type SpanBusqueda, type SpanLigero } from "./busquedas";

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

  it("un turno en curso (el último del thread, sin agent_run posterior) deja la ventana abierta", () => {
    // Sin run2 en los spans: es el caso real de un turno vivo (streaming en
    // /revision), no el de un turno muerto con más turnos después.
    const soloRun1 = spans.filter((span) => span.spanId !== "run2" && span.spanId !== "t2");
    const enCurso: SpanLigero[] = soloRun1.map((span) =>
      span.spanId === "run1" ? { ...span, endedAt: null } : span,
    );
    const [busqueda] = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1")],
      spans: enCurso,
      // m2 cae después de run1.startedAt y no hay turno siguiente: gana el último.
      mensajes,
    });
    expect(busqueda?.messageId).toBe("m2");
  });

  it("un turno sin endedAt que NO es el último no se roba el mensaje del turno siguiente", () => {
    // El bug real: un turno muerto a mitad (proceso caído, timeout del
    // gateway) con endedAt NULL, seguido por otro turno con su propio
    // mensaje. La ventana abierta no puede colgarle a t1 el mensaje de run2.
    const run1SinEndedAt: SpanLigero[] = spans.map((span) =>
      span.spanId === "run1" ? { ...span, endedAt: null } : span,
    );
    const resultado = agruparBusquedas({
      busquedas: [spanBusqueda("t1", "run1"), spanBusqueda("t2", "run2")],
      spans: run1SinEndedAt,
      mensajes,
    });
    expect(resultado.map((busqueda) => [busqueda.spanId, busqueda.messageId])).toEqual([
      ["t1", "m1"],
      ["t2", "m2"],
    ]);
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
