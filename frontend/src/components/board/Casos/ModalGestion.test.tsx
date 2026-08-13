import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GestionCaso } from "@/lib/casos/gestion";

import { ModalGestion } from "./ModalGestion";

const gestionBase: GestionCaso = {
  estado: "NUEVO",
  nota: null,
  por: null,
  en: null,
  historial: [],
};

function montar(gestion: GestionCaso = gestionBase) {
  const onGuardado = vi.fn();
  render(<ModalGestion casoId="caso-1" gestion={gestion} onGuardado={onGuardado} />);
  return { onGuardado };
}

describe("ModalGestion", () => {
  beforeEach(() => vi.resetAllMocks());

  it("no muestra el modal hasta que se toca Gestionar", () => {
    montar();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));

    expect(screen.getByRole("dialog", { name: "Gestión del caso" })).toBeInTheDocument();
  });

  it("abre con el estado vigente seleccionado", () => {
    montar({ ...gestionBase, estado: "CONTACTADO" });

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));

    expect(screen.getByRole("button", { name: "Contactado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Nuevo" })).toHaveAttribute("aria-pressed", "false");
  });

  it("cierra con Cancelar sin llamar a la API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Esc es la salida que un teclado espera de un modal; sin ella el foco queda
  // atrapado en un panel que solo se cierra con el mouse.
  it("cierra con Escape", () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Volver a abrir tiene que partir del estado vigente: si arrastra la
  // selección a medio elegir de la vez anterior, un Guardar apurado escribe un
  // cambio que nadie eligió en esta pasada.
  it("descarta la selección al cerrar y vuelve a abrir en el estado vigente", () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Derivado" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));

    expect(screen.getByRole("button", { name: "Nuevo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Derivado" })).toHaveAttribute("aria-pressed", "false");
  });

  it("lista el historial con etiquetas legibles, no el enum crudo", () => {
    montar({
      estado: "DERIVADO",
      nota: "Va a Martínez.",
      por: "ana@estudio.uy",
      en: "2026-08-11T12:00:00.000Z",
      historial: [
        {
          id: "ev-1",
          de: "CONTACTADO",
          a: "DERIVADO",
          nota: "Va a Martínez.",
          por: "ana@estudio.uy",
          createdAt: "2026-08-11T12:00:00.000Z",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));

    expect(screen.getByText(/Contactado → Derivado/)).toBeInTheDocument();
    expect(screen.queryByText(/CONTACTADO → DERIVADO/)).not.toBeInTheDocument();
    expect(screen.getByText("Va a Martínez.")).toBeInTheDocument();
  });
});
