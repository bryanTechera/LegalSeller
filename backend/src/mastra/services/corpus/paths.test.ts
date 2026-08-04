import { describe, expect, it } from "vitest";

import { derivarDocumento, hashContenido } from "./paths.js";

const CONTENIDO = "# Despido — Modalidades de despido\n\nTexto del documento.";

describe("derivarDocumento", () => {
  it("deriva categoría, subcategoría y título de una ruta habilitada", () => {
    const doc = derivarDocumento("laboral/despido/03-modalidades-despido.md", CONTENIDO);
    expect(doc).toEqual({
      rutaRelativa: "laboral/despido/03-modalidades-despido.md",
      categoria: "laboral",
      subcategoria: "despido",
      title: "Despido — Modalidades de despido",
    });
  });

  it("mapea la carpeta generales a subcategoria NULL (corpus transversal)", () => {
    // El retrieval mantiene en alcance los documentos con subcategoria NULL
    // vía `OR d."subcategoria" IS NULL`. Cargarlos como "generales" los deja
    // invisibles al filtro del agente — es el bug del 2026-07-21.
    const doc = derivarDocumento("laboral/generales/01-prescripcion.md", CONTENIDO);
    expect(doc.subcategoria).toBeNull();
  });

  it("rechaza una categoría que no existe en el registry", () => {
    expect(() => derivarDocumento("penal/generales/01-x.md", CONTENIDO)).toThrow(/penal/);
  });

  it("rechaza una subcategoría que el agente no filtra", () => {
    expect(() => derivarDocumento("laboral/inventada/01-x.md", CONTENIDO)).toThrow(/inventada/);
  });

  it("el error de subcategoría desconocida lista las válidas", () => {
    expect(() => derivarDocumento("laboral/inventada/01-x.md", CONTENIDO)).toThrow(/despido/);
  });

  it("rechaza un archivo sin encabezado de título", () => {
    expect(() => derivarDocumento("laboral/despido/01-x.md", "Sin encabezado.")).toThrow(/encabezado/);
  });

  it("rechaza una ruta con profundidad inesperada", () => {
    expect(() => derivarDocumento("laboral/01-x.md", CONTENIDO)).toThrow(/categoria/);
  });
});

describe("hashContenido", () => {
  it("es estable para el mismo texto y distinto para textos distintos", () => {
    expect(hashContenido("abc")).toBe(hashContenido("abc"));
    expect(hashContenido("abc")).not.toBe(hashContenido("abd"));
  });

  it("devuelve sha256 en hex (64 caracteres)", () => {
    expect(hashContenido("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});
