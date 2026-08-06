import { describe, expect, it } from "vitest";

import { buildTransitoInstructions } from "./instructions.js";

describe("instrucciones del agente transito", () => {
  it("compone persona, rol, conducta y venta", () => {
    const prompt = buildTransitoInstructions(null);
    expect(prompt).toContain("<personalidad>");
    expect(prompt).toContain("<rol>");
    expect(prompt).toContain("<captacion>");
    expect(prompt).toContain("Fundá cada afirmación normativa");
    expect(prompt).toContain("material inédito y de propiedad intelectual propia desarrollado por DudaYa");
    expect(prompt).toContain("materia de tránsito");
    expect(prompt).toContain("buscar-documentos");
  });

  it("restricciones propias del dominio: sin atribución de culpa y vía penal derivada", () => {
    const prompt = buildTransitoInstructions(null);
    expect(prompt).toContain("culpa del siniestro");
    expect(prompt).toContain("homicidio culposo");
    const rolIdx = prompt.indexOf("<rol>");
    const captacionIdx = prompt.indexOf("<captacion>");
    expect(rolIdx).toBeGreaterThan(-1);
    expect(rolIdx).toBeLessThan(captacionIdx);
  });

  it("inyecta el brief del receptor cuando viene en el contexto", () => {
    const prompt = buildTransitoInstructions({ userId: "s1", casoBrief: "Choque con fractura de brazo, el otro vehículo se retiró." });
    expect(prompt).toContain("Choque con fractura de brazo");
  });

  it("inyecta la fecha actual como bloque volátil", () => {
    const prompt = buildTransitoInstructions(null);
    expect(prompt).toContain("<contexto_temporal>");
    expect(prompt).toContain(String(new Date().getFullYear()));
  });

  it("con pedidoContactoHecho inyecta <estado_captacion> al final y cambia la variante de captación", () => {
    const prompt = buildTransitoInstructions({ userId: "s1", pedidoContactoHecho: true });
    expect(prompt).toContain("<estado_captacion>");
    expect(prompt.indexOf("<estado_captacion>")).toBeGreaterThan(prompt.indexOf("<contexto_temporal>"));
    expect(prompt).not.toContain("Pedí los datos de contacto");
  });
});
