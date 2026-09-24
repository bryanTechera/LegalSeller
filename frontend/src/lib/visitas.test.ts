import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: { visita: { findFirst: vi.fn(), create: vi.fn() } },
}));
vi.mock("@/lib/prisma", () => prismaMock);

import { esBot, origenDeVisita, registrarVisita } from "./visitas";

// UA real del log HTTP de producción (campaña 2026-09-23).
const UA_INSTAGRAM =
  "Mozilla/5.0 (Linux; Android 14; 24117RN76L Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/152.0.7977.52 Mobile Safari/537.36 Instagram 444.0.0.46.85 Android (34/14; 450dpi; 1080x2400; Xiaomi/Redmi; 24117RN76L; tanzanite; mt6789; es_ES; 1055488051; IABMV/1)";
const UA_FACEBOOK =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/23G90 [FBAN/FBIOS;FBAV/480.0.0.40.108]";
const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

describe("origenDeVisita", () => {
  it("el utm_source manda sobre todo lo demás", () => {
    expect(origenDeVisita({ utmSource: " IG_Ads ", userAgent: UA_INSTAGRAM, referrer: "https://google.com/" })).toBe(
      "ig_ads",
    );
  });

  it("sin utm, el navegador interno de Instagram o Facebook identifica el origen", () => {
    expect(origenDeVisita({ userAgent: UA_INSTAGRAM })).toBe("instagram");
    expect(origenDeVisita({ userAgent: UA_FACEBOOK })).toBe("facebook");
  });

  it("sin utm ni app, usa el dominio del referrer sin www", () => {
    expect(origenDeVisita({ userAgent: UA_CHROME, referrer: "https://www.google.com/search?q=x" })).toBe("google.com");
  });

  it("un referrer del propio sitio o inválido no es un origen", () => {
    expect(origenDeVisita({ userAgent: UA_CHROME, referrer: "https://dudaya.com/board", host: "dudaya.com" })).toBe(
      "directo",
    );
    expect(origenDeVisita({ userAgent: UA_CHROME, referrer: "no es una url" })).toBe("directo");
  });

  it("sin ninguna señal es directo", () => {
    expect(origenDeVisita({ userAgent: UA_CHROME })).toBe("directo");
  });
});

describe("esBot", () => {
  it.each([
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) Safari/604.1 (compatible; meta-externalads/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    "",
  ])("descarta %s", (ua) => {
    expect(esBot(ua)).toBe(true);
  });

  it("no descarta navegadores reales", () => {
    expect(esBot(UA_INSTAGRAM)).toBe(false);
    expect(esBot(UA_CHROME)).toBe(false);
  });
});

describe("registrarVisita", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.prisma.visita.findFirst.mockResolvedValue(null);
  });

  it("guarda el origen y la campaña, nunca el user agent ni la IP", async () => {
    await registrarVisita({
      sessionId: "s1",
      userAgent: UA_INSTAGRAM,
      utmSource: "instagram",
      utmMedium: "paid",
      utmCampaign: "lanzamiento",
      referrer: "https://l.instagram.com/",
    });

    expect(prismaMock.prisma.visita.create).toHaveBeenCalledWith({
      data: {
        sessionId: "s1",
        origen: "instagram",
        utmSource: "instagram",
        utmMedium: "paid",
        utmCampaign: "lanzamiento",
        referrerHost: "l.instagram.com",
      },
    });
  });

  it("no registra bots", async () => {
    const resultado = await registrarVisita({ sessionId: "s1", userAgent: "facebookexternalhit/1.1" });
    expect(resultado).toBe("bot");
    expect(prismaMock.prisma.visita.create).not.toHaveBeenCalled();
  });

  // Una recarga, el doble render de desarrollo o volver a la pestaña no son
  // visitantes nuevos: la sesión cuenta una vez por ventana.
  it("no duplica la visita de la misma sesión dentro de la ventana", async () => {
    prismaMock.prisma.visita.findFirst.mockResolvedValue({ id: "v1" });
    const resultado = await registrarVisita({ sessionId: "s1", userAgent: UA_CHROME });
    expect(resultado).toBe("duplicada");
    expect(prismaMock.prisma.visita.create).not.toHaveBeenCalled();
    const where = prismaMock.prisma.visita.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ sessionId: "s1", createdAt: { gte: expect.any(Date) } });
  });
});
