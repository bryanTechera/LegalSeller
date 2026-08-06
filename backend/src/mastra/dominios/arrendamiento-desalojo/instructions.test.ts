import { describe, expect, it } from "vitest";

import { buildArrendamientoDesalojoInstructions } from "./instructions.js";

describe("instrucciones del agente arrendamiento-desalojo", () => {
  it("compone persona, rol, conducta y venta", () => {
    const prompt = buildArrendamientoDesalojoInstructions(null);
    expect(prompt).toContain("<personalidad>");
    expect(prompt).toContain("<rol>");
    expect(prompt).toContain("<captacion>");
    expect(prompt).toContain("Fundá cada afirmación normativa");
    expect(prompt).toContain("material inédito y de propiedad intelectual propia desarrollado por DudaYa");
    expect(prompt).toContain("materia de arrendamientos y desalojos");
    expect(prompt).toContain("buscar-documentos");
  });

  it("partición por régimen: exige encuadrar antes de afirmar plazos y distingue defensa de desocupación", () => {
    const prompt = buildArrendamientoDesalojoInstructions(null);
    expect(prompt).toContain("Ley 19.889");
    expect(prompt).toContain("plazo para defenderse");
    expect(prompt).toContain("mano propia");
  });

  it("inyecta el brief del receptor cuando viene en el contexto", () => {
    const prompt = buildArrendamientoDesalojoInstructions({
      userId: "s1",
      casoBrief: "Cedulón de desalojo recibido ayer por un apartamento alquilado con garantía.",
    });
    expect(prompt).toContain("Cedulón de desalojo recibido ayer");
  });

  it("inyecta la fecha actual como bloque volátil", () => {
    const prompt = buildArrendamientoDesalojoInstructions(null);
    expect(prompt).toContain("<contexto_temporal>");
    expect(prompt).toContain(String(new Date().getFullYear()));
  });

  it("nivel 2 colapsado: instruye determinar y registrar la subcategoría", () => {
    const prompt = buildArrendamientoDesalojoInstructions(null);
    expect(prompt).toContain("registrar-caso");
    expect(prompt).toContain("contrato-de-alquiler");
    expect(prompt).toContain("desalojo-ley-19889");
  });

  it("con pedidoContactoHecho inyecta <estado_captacion> al final y cambia la variante de captación", () => {
    const prompt = buildArrendamientoDesalojoInstructions({ userId: "s1", pedidoContactoHecho: true });
    expect(prompt).toContain("<estado_captacion>");
    expect(prompt.indexOf("<estado_captacion>")).toBeGreaterThan(prompt.indexOf("<contexto_temporal>"));
    expect(prompt).not.toContain("Pedí los datos de contacto");
  });
});
