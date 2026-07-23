import { describe, expect, it } from "vitest";

import { buildFamiliaInstructions } from "./instructions.js";

describe("instrucciones del agente familia", () => {
  it("compone persona, protocolo sensible, conducta y venta", () => {
    const prompt = buildFamiliaInstructions(null);
    expect(prompt).toContain("<personalidad>");
    expect(prompt).toContain("<caso_sensible>");
    expect(prompt).toContain("<captacion>");
    expect(prompt).toContain("Fundá cada afirmación normativa");
    expect(prompt).toContain("material inédito y de propiedad intelectual propia desarrollado por Jurco");
    expect(prompt).toContain("materia de familia");
    expect(prompt).toContain("buscar-documentos");
  });

  it("tratamiento diferencial de violencia: sin mediación con el agresor y seguridad primero", () => {
    const prompt = buildFamiliaInstructions(null);
    expect(prompt).toContain("mediación");
    expect(prompt).toContain("0800 4141");
    const sensibleIdx = prompt.indexOf("<caso_sensible>");
    const rolIdx = prompt.indexOf("<rol>");
    expect(sensibleIdx).toBeGreaterThan(-1);
    expect(sensibleIdx).toBeLessThan(rolIdx);
  });

  it("inyecta el brief del receptor cuando viene en el contexto", () => {
    const prompt = buildFamiliaInstructions({ userId: "s1", casoBrief: "Divorcio con dos hijos menores." });
    expect(prompt).toContain("Divorcio con dos hijos menores.");
  });

  it("inyecta la fecha actual como bloque volátil", () => {
    const prompt = buildFamiliaInstructions(null);
    expect(prompt).toContain("<contexto_temporal>");
    expect(prompt).toContain(String(new Date().getFullYear()));
  });

  it("nivel 2 colapsado: instruye determinar y registrar la subcategoría", () => {
    const prompt = buildFamiliaInstructions(null);
    expect(prompt).toContain("registrar-caso");
    expect(prompt).toContain("pension-tenencia-visitas");
  });

  it("con pedidoContactoHecho inyecta <estado_captacion> al final y cambia la variante de captación", () => {
    const prompt = buildFamiliaInstructions({ userId: "s1", pedidoContactoHecho: true });
    expect(prompt).toContain("<estado_captacion>");
    expect(prompt.indexOf("<estado_captacion>")).toBeGreaterThan(prompt.indexOf("<contexto_temporal>"));
    expect(prompt).not.toContain("Pedí los datos de contacto");
  });
});
