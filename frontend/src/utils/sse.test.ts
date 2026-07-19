import { describe, expect, it } from "vitest";

import { createSseLineSplitter, parseSseData } from "./sse";

describe("parseSseData", () => {
  it("extracts text-delta events", () => {
    expect(parseSseData('{"type":"text-delta","id":"1","delta":"Hola"}')).toEqual({ kind: "text", text: "Hola" });
  });

  it("supports alternative delta field names", () => {
    expect(parseSseData('{"type":"text-delta","textDelta":"mundo"}')).toEqual({ kind: "text", text: "mundo" });
  });

  it("maps error events", () => {
    expect(parseSseData('{"type":"error","errorText":"boom"}')).toEqual({ kind: "error", message: "boom" });
  });

  it("ignores non-text events, [DONE] and malformed JSON", () => {
    expect(parseSseData('{"type":"text-start","id":"1"}')).toBeNull();
    expect(parseSseData('{"type":"finish"}')).toBeNull();
    expect(parseSseData("[DONE]")).toBeNull();
    expect(parseSseData("not-json")).toBeNull();
    expect(parseSseData("")).toBeNull();
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
