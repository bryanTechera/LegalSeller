import { describe, expect, it } from "vitest";

import { buildRelacionesConsumoInstructions } from "./instructions.js";

describe("instrucciones del agente relaciones-consumo", () => {
  it("compone persona, rol, conducta y venta", () => {
    const prompt = buildRelacionesConsumoInstructions(null);
    expect(prompt).toContain("<personalidad>");
    expect(prompt).toContain("<rol>");
    expect(prompt).toContain("<captacion>");
    expect(prompt).toContain("Fundá cada afirmación normativa");
    expect(prompt).toContain("material inédito y de propiedad intelectual propia desarrollado por DudaYa");
    expect(prompt).toContain("materia de defensa del consumidor");
    expect(prompt).toContain("buscar-documentos");
    const personalidadIdx = prompt.indexOf("<personalidad>");
    const rolIdx = prompt.indexOf("<rol>");
    expect(personalidadIdx).toBeGreaterThan(-1);
    expect(personalidadIdx).toBeLessThan(rolIdx);
  });

  it("sin protocolo de caso sensible propio (queda en el receptor)", () => {
    const prompt = buildRelacionesConsumoInstructions(null);
    expect(prompt).not.toContain("<caso_sensible>");
  });

  it("inyecta el brief del receptor cuando viene en el contexto", () => {
    const prompt = buildRelacionesConsumoInstructions({
      userId: "s1",
      casoBrief: "Compró un lavarropas que llegó fallado y el comercio no responde.",
    });
    expect(prompt).toContain("Compró un lavarropas que llegó fallado y el comercio no responde.");
  });

  it("inyecta la fecha actual como bloque volátil", () => {
    const prompt = buildRelacionesConsumoInstructions(null);
    expect(prompt).toContain("<contexto_temporal>");
    expect(prompt).toContain(String(new Date().getFullYear()));
  });

  it("nivel 2 colapsado: instruye determinar y registrar la subcategoría", () => {
    const prompt = buildRelacionesConsumoInstructions(null);
    expect(prompt).toContain("registrar-caso");
    expect(prompt).toContain("derechos-del-consumidor");
    expect(prompt).toContain("procedimiento-mef-judicial");
  });

  it("con pedidoContactoHecho inyecta <estado_captacion> al final y cambia la variante de captación", () => {
    const prompt = buildRelacionesConsumoInstructions({ userId: "s1", pedidoContactoHecho: true });
    expect(prompt).toContain("<estado_captacion>");
    expect(prompt.indexOf("<estado_captacion>")).toBeGreaterThan(prompt.indexOf("<contexto_temporal>"));
    expect(prompt).not.toContain("Pedí los datos de contacto");
  });
});
