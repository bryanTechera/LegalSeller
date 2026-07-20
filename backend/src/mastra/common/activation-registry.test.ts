import { describe, expect, it, vi } from "vitest";

import { ActivationRegistry, type RegistryItem } from "./activation-registry.js";
import { fallbackLogger } from "./logger.js";

const contenido = (texto: string): RegistryItem["fn"] => () => texto;
const soloPara = (agente: string, texto: string): RegistryItem["fn"] =>
  (_readOnly, agentId) => (agentId === agente ? texto : null);

describe("ActivationRegistry", () => {
  it("concatena en orden de registración solo los items que activan para el agente", () => {
    const registry = new ActivationRegistry("test", [
      { id: "a", fn: contenido("<a/>") },
      { id: "b", fn: soloPara("laboral", "<b/>") },
      { id: "c", fn: contenido("<c/>") },
    ]);
    const recepcion = registry.execute(null, "recepcion");
    expect(recepcion.inicio).toBe("<a/>\n\n<c/>");
    expect(recepcion.activatedIds).toEqual(["a", "c"]);

    const laboral = registry.execute(null, "laboral");
    expect(laboral.inicio).toBe("<a/>\n\n<b/>\n\n<c/>");
  });

  it("separa los items con posicion final", () => {
    const registry = new ActivationRegistry("test", [
      { id: "a", fn: contenido("<a/>") },
      { id: "z", fn: contenido("<z/>"), posicion: "final" },
      { id: "b", fn: contenido("<b/>") },
    ]);
    const result = registry.execute(null, "laboral");
    expect(result.inicio).toBe("<a/>\n\n<b/>");
    expect(result.final).toBe("<z/>");
    expect(result.activatedIds).toEqual(["a", "z", "b"]);
  });

  it("un item crítico que tira aborta la construcción con el id en el mensaje", () => {
    const registry = new ActivationRegistry("test", [
      { id: "rota", critical: true, fn: () => { throw new Error("boom"); } },
    ]);
    // toThrow, no toThrowError: el alias está deprecado en vitest 4 y
    // @typescript-eslint/no-deprecated (strictTypeChecked) lo rechaza.
    expect(() => registry.execute(null, "laboral")).toThrow(/rota/);
  });

  it("un item no crítico que tira se omite, queda en failedIds y se loggea", () => {
    const warnSpy = vi.spyOn(fallbackLogger, "warn").mockImplementation(() => undefined);
    try {
      const registry = new ActivationRegistry("test", [
        { id: "fragil", fn: () => { throw new Error("boom"); } },
        { id: "sana", fn: contenido("<sana/>") },
      ]);
      const result = registry.execute(null, "laboral");
      expect(result.inicio).toBe("<sana/>");
      expect(result.failedIds).toEqual(["fragil"]);
      expect(result.activatedIds).toEqual(["sana"]);
      expect(warnSpy).toHaveBeenCalledWith(
        "Item de registry falló; se omite del prompt",
        expect.objectContaining({ registry: "test", itemId: "fragil" }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("items que devuelven null no aparecen en activatedIds ni failedIds", () => {
    const registry = new ActivationRegistry("test", [{ id: "muda", fn: () => null }]);
    const result = registry.execute(null, "recepcion");
    expect(result).toEqual({ inicio: "", final: "", activatedIds: [], failedIds: [] });
  });
});
