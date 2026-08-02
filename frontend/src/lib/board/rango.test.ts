import { describe, expect, it } from "vitest";

import { fechaDesde, rangoSchema } from "./rango";

const AHORA = new Date("2026-08-01T12:00:00.000Z");

describe("fechaDesde", () => {
  it("7d resta siete días", () => {
    expect(fechaDesde("7d", AHORA)!.toISOString()).toBe("2026-07-25T12:00:00.000Z");
  });

  it("30d resta treinta días", () => {
    expect(fechaDesde("30d", AHORA)!.toISOString()).toBe("2026-07-02T12:00:00.000Z");
  });

  it("90d resta noventa días", () => {
    expect(fechaDesde("90d", AHORA)!.toISOString()).toBe("2026-05-03T12:00:00.000Z");
  });

  it("todo devuelve null (sin cota inferior)", () => {
    expect(fechaDesde("todo", AHORA)).toBeNull();
  });
});

describe("rangoSchema", () => {
  it("acepta los cuatro valores", () => {
    expect(rangoSchema.parse("7d")).toBe("7d");
    expect(rangoSchema.parse("todo")).toBe("todo");
  });

  it("rechaza un valor desconocido", () => {
    expect(rangoSchema.safeParse("1d").success).toBe(false);
  });
});
