import { describe, expect, it } from "vitest";

import { crearValorCookieExperto, verificarValorCookieExperto } from "./experto-cookie";

const CLAVE = "clave-super-secreta";

describe("cookie de experto", () => {
  it("roundtrip: firma y verifica el nombre", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    expect(verificarValorCookieExperto(valor, CLAVE)).toEqual({ nombre: "Dra. García" });
  });

  it("rechaza una firma adulterada", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    const [payload] = valor.split(".");
    expect(verificarValorCookieExperto(`${payload}.firma-falsa`, CLAVE)).toBeNull();
  });

  it("rechaza un payload adulterado (firma de otro contenido)", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    const [, firma] = valor.split(".");
    const otroPayload = Buffer.from(JSON.stringify({ nombre: "Impostor", iat: 1 })).toString("base64url");
    expect(verificarValorCookieExperto(`${otroPayload}.${firma}`, CLAVE)).toBeNull();
  });

  it("rotar la clave revoca cookies emitidas", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    expect(verificarValorCookieExperto(valor, "clave-rotada")).toBeNull();
  });

  it("clave ausente (feature apagada) nunca autoriza", () => {
    const valor = crearValorCookieExperto("Dra. García", CLAVE);
    expect(verificarValorCookieExperto(valor, null)).toBeNull();
  });

  it("valores malformados devuelven null, no explotan", () => {
    for (const v of [undefined, "", "sin-punto", "a.b.c", "!!.??"]) {
      expect(verificarValorCookieExperto(v, CLAVE)).toBeNull();
    }
  });
});
