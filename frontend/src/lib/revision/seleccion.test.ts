import { beforeEach, describe, expect, it } from "vitest";

import { citaDesdeSeleccion, type SeleccionComoTexto } from "./seleccion";

function armarDom(): { contenedor: HTMLElement; m1: HTMLElement; m2: HTMLElement } {
  const contenedor = document.createElement("section");
  const m1 = document.createElement("article");
  m1.dataset.messageId = "msg-1";
  m1.textContent = "El tope legal son seis mensualidades.";
  const m2 = document.createElement("article");
  m2.dataset.messageId = "msg-2";
  m2.textContent = "Además corresponde la licencia.";
  contenedor.append(m1, m2);
  document.body.append(contenedor);
  return { contenedor, m1, m2 };
}

function seleccion(anchorNode: Node | null, focusNode: Node | null, texto: string, isCollapsed = false): SeleccionComoTexto {
  return { isCollapsed, anchorNode, focusNode, toString: () => texto };
}

describe("citaDesdeSeleccion", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("selección dentro de un mensaje: devuelve messageId y la cita", () => {
    const { contenedor, m1 } = armarDom();
    const resultado = citaDesdeSeleccion(seleccion(m1.firstChild, m1.firstChild, "seis mensualidades"), contenedor);
    expect(resultado).toEqual({ messageId: "msg-1", cita: "seis mensualidades" });
  });

  it("selección que cruza dos mensajes: null", () => {
    const { contenedor, m1, m2 } = armarDom();
    expect(citaDesdeSeleccion(seleccion(m1.firstChild, m2.firstChild, "cruzada"), contenedor)).toBeNull();
  });

  it("selección colapsada o vacía: null", () => {
    const { contenedor, m1 } = armarDom();
    expect(citaDesdeSeleccion(seleccion(m1.firstChild, m1.firstChild, "   "), contenedor)).toBeNull();
    expect(citaDesdeSeleccion(seleccion(m1.firstChild, m1.firstChild, "algo", true), contenedor)).toBeNull();
  });

  it("selección fuera del contenedor: null", () => {
    const { m1 } = armarDom();
    const otro = document.createElement("div");
    expect(citaDesdeSeleccion(seleccion(m1.firstChild, m1.firstChild, "texto"), otro)).toBeNull();
  });

  it("recorta la cita a 2000 caracteres", () => {
    const { contenedor, m1 } = armarDom();
    const larga = "a".repeat(2500);
    const resultado = citaDesdeSeleccion(seleccion(m1.firstChild, m1.firstChild, larga), contenedor);
    expect(resultado?.cita).toHaveLength(2000);
  });
});
