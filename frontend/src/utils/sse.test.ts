import { describe, expect, it } from "vitest";

import { createSseLineSplitter, parseSseData } from "./sse";

describe("parseSseData", () => {
  it("extracts Mastra native text-delta events (payload.text)", () => {
    expect(
      parseSseData('{"type":"text-delta","runId":"r1","from":"AGENT","payload":{"id":"t1","text":"¡Hola!"}}'),
    ).toEqual({ kind: "text", text: "¡Hola!" });
  });

  it("extracts AI SDK style text-delta events (top-level delta)", () => {
    expect(parseSseData('{"type":"text-delta","id":"1","delta":"Hola"}')).toEqual({ kind: "text", text: "Hola" });
    expect(parseSseData('{"type":"text-delta","textDelta":"mundo"}')).toEqual({ kind: "text", text: "mundo" });
  });

  it("maps error events from both shapes", () => {
    expect(parseSseData('{"type":"error","errorText":"boom"}')).toEqual({ kind: "error", message: "boom" });
    expect(parseSseData('{"type":"error","payload":{"error":"falló"}}')).toEqual({ kind: "error", message: "falló" });
  });

  it("ignores non-text events, [DONE] and malformed JSON", () => {
    expect(parseSseData('{"type":"text-start","id":"1"}')).toBeNull();
    expect(parseSseData('{"type":"finish"}')).toBeNull();
    expect(parseSseData("[DONE]")).toBeNull();
    expect(parseSseData("not-json")).toBeNull();
    expect(parseSseData("")).toBeNull();
  });
});

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

describe("createSseLineSplitter", () => {
  it("splits complete data lines and buffers partial ones", () => {
    const feed = createSseLineSplitter();
    expect(feed('data: {"a":1}\ndata: {"b":')).toEqual(['{"a":1}']);
    expect(feed('2}\n')).toEqual(['{"b":2}']);
  });

  it("ignores non-data lines (comments, event names, blanks)", () => {
    const feed = createSseLineSplitter();
    expect(feed(": keep-alive\nevent: message\n\ndata: {\"x\":1}\n")).toEqual(['{"x":1}']);
  });
});
