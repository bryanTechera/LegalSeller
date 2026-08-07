import { describe, expect, it } from "vitest";

import { SITIO_URL } from "@/lib/marca";

import robots from "./robots";

describe("robots.txt", () => {
  const salida = robots();
  const reglas = Array.isArray(salida.rules) ? salida.rules : [salida.rules];
  const disallow = reglas.flatMap((r) => (Array.isArray(r?.disallow) ? r.disallow : [r?.disallow]));

  it("deja el sitio abierto: hoy no hay robots.txt y todo está permitido, y eso no cambia", () => {
    expect(reglas.some((r) => r?.userAgent === "*" && r.allow === "/")).toBe(true);
  });

  it("no bloquea a ningún agente en particular — la política de crawlers de IA es una decisión sin tomar", () => {
    expect(reglas).toHaveLength(1);
  });

  it("bloquea /api y /board, que no son páginas y solo gastan presupuesto de rastreo", () => {
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/board/");
  });

  it("NO bloquea /login, que lleva noindex: bloquear el rastreo esconde el noindex y la deja indexable", () => {
    expect(disallow.some((ruta) => ruta?.startsWith("/login"))).toBe(false);
  });

  it("declara el sitemap en absoluto", () => {
    expect(salida.sitemap).toBe(`${SITIO_URL}/sitemap.xml`);
  });
});
