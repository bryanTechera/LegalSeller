import { beforeEach, describe, expect, it, vi } from "vitest";

const allowlistMock = vi.hoisted(() => ({ isAllowed: vi.fn() }));
vi.mock("@/lib/board/allowlist", () => allowlistMock);

import { authConfig } from "./auth.config";

const jwt = authConfig.callbacks.jwt;
if (!jwt) throw new Error("authConfig.callbacks.jwt no está definido");

type JwtParams = Parameters<typeof jwt>[0];

/**
 * El tipo de next-auth declara `user` como requerido, pero en la práctica el
 * callback corre sin él en todo request posterior al signIn — exactamente el
 * escenario que este fix cubre. El cast documenta ese desfasaje puntual en
 * vez de simularlo con un User de relleno en cada test.
 */
function params(overrides: Partial<JwtParams>): JwtParams {
  return { token: {}, ...overrides } as unknown as JwtParams;
}

describe("authConfig.callbacks.jwt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sign-in con email permitido conserva el token", async () => {
    allowlistMock.isAllowed.mockReturnValue(true);
    const resultado = await jwt(params({ user: { email: "ana@jurco.uy", name: "Ana" } }));
    expect(resultado).toMatchObject({ email: "ana@jurco.uy", name: "Ana" });
  });

  it("sign-in con email fuera de la allowlist invalida la sesión", async () => {
    allowlistMock.isAllowed.mockReturnValue(false);
    const resultado = await jwt(params({ user: { email: "intruso@example.com" } }));
    expect(resultado).toBeNull();
  });

  // El caso central del fix: un request posterior al signIn (sin `user`,
  // solo `token`) para un email que salió de ALLOWED_EMAILS entre requests
  // debe invalidar la sesión — no alcanza con chequear solo al signIn, porque
  // con estrategia JWT no hay fila de Session que borrar para revocar antes.
  it("re-chequea la allowlist en cada invocación, no solo al signIn", async () => {
    allowlistMock.isAllowed.mockReturnValue(false);
    const resultado = await jwt(params({ token: { email: "removido@jurco.uy" } }));
    expect(resultado).toBeNull();
    expect(allowlistMock.isAllowed).toHaveBeenCalledWith("removido@jurco.uy");
  });

  it("token vigente para un email que sigue permitido persiste en requests posteriores", async () => {
    allowlistMock.isAllowed.mockReturnValue(true);
    const resultado = await jwt(params({ token: { email: "ana@jurco.uy", name: "Ana" } }));
    expect(resultado).toMatchObject({ email: "ana@jurco.uy" });
  });

  it("token sin email (forma inesperada) se trata como no permitido", async () => {
    allowlistMock.isAllowed.mockReturnValue(false);
    const resultado = await jwt(params({ token: {} }));
    expect(resultado).toBeNull();
    expect(allowlistMock.isAllowed).toHaveBeenCalledWith(null);
  });
});
