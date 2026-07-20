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
