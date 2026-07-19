import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formatValidationError, parseRequestBody, parseSearchParams } from "./common";

const schema = z.object({
  title: z.string().min(1, "no puede estar vacío"),
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("parseRequestBody", () => {
  it("returns data for a valid body", async () => {
    const result = await parseRequestBody(jsonRequest({ title: "Contrato" }), schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Contrato");
    }
  });

  it("returns a 400 response for an invalid body", async () => {
    const result = await parseRequestBody(jsonRequest({ title: "" }), schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
      const payload = await result.response.json();
      expect(payload.code).toBe("VALIDATION_ERROR");
      expect(payload.error).toContain("el título");
    }
  });

  it("returns a 400 response for malformed JSON", async () => {
    const request = new Request("http://localhost/api/test", { method: "POST", body: "not-json" });
    const result = await parseRequestBody(request, schema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.response.status).toBe(400);
    }
  });
});

describe("parseSearchParams", () => {
  it("validates search params against the schema", () => {
    const params = new URLSearchParams({ title: "Estatuto" });
    const result = parseSearchParams(params, schema);
    expect(result.success).toBe(true);
  });
});

describe("formatValidationError", () => {
  it("maps known field paths to friendly Spanish names", () => {
    const parsed = schema.safeParse({ title: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(formatValidationError(parsed.error)).toBe("Hay un problema con el título: no puede estar vacío");
    }
  });
});
