import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => authMock);

const expertoMock = vi.hoisted(() => ({ getExperto: vi.fn() }));
vi.mock("@/lib/revision/experto-cookie", () => expertoMock);

import { getIdentidadBoard } from "./identidad";

describe("getIdentidadBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.auth.mockResolvedValue(null);
    expertoMock.getExperto.mockResolvedValue(null);
  });

  it("con sesión Auth.js devuelve el nombre de la cuenta como humano", async () => {
    authMock.auth.mockResolvedValue({ user: { name: "Dra. García", email: "garcia@jurco.uy" } });
    expect(await getIdentidadBoard()).toEqual({ nombre: "Dra. García", tipo: "humano" });
  });

  it("sesión sin nombre cae al email", async () => {
    authMock.auth.mockResolvedValue({ user: { name: null, email: "garcia@jurco.uy" } });
    expect(await getIdentidadBoard()).toEqual({ nombre: "garcia@jurco.uy", tipo: "humano" });
  });

  it("sin sesión pero con cookie del runner devuelve tipo runner", async () => {
    expertoMock.getExperto.mockResolvedValue({ nombre: "Asistente técnico" });
    expect(await getIdentidadBoard()).toEqual({ nombre: "Asistente técnico", tipo: "runner" });
  });

  // La sesión humana gana: si alguien tiene ambas, la autoría real es la persona.
  it("con ambas credenciales prevalece la sesión Auth.js", async () => {
    authMock.auth.mockResolvedValue({ user: { name: "Dra. García", email: "garcia@jurco.uy" } });
    expertoMock.getExperto.mockResolvedValue({ nombre: "Asistente técnico" });
    expect(await getIdentidadBoard()).toEqual({ nombre: "Dra. García", tipo: "humano" });
  });

  it("sin ninguna credencial devuelve null", async () => {
    expect(await getIdentidadBoard()).toBeNull();
  });
});
