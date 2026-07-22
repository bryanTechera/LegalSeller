import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SesionResumen } from "@/lib/revision/sesiones";

import { ListadoSesiones } from "./ListadoSesiones";

function sesion(overrides: Partial<SesionResumen>): SesionResumen {
  return {
    id: "s1",
    titulo: "Sesión",
    creadaPor: "Dra. García",
    origenRevision: "EXPERTO",
    borrador: false,
    actualizadaEn: "2026-07-22T12:00:00.000Z",
    notasAbiertas: 0,
    notasRespondidas: 0,
    ...overrides,
  };
}

describe("ListadoSesiones", () => {
  it("sesión autónoma muestra el badge de origen", () => {
    render(
      <ListadoSesiones
        sesiones={[sesion({ id: "a1", origenRevision: "AUTONOMA", creadaPor: "Asistente técnico" })]}
        onAbrir={vi.fn()}
        onCrear={vi.fn()}
      />,
    );
    expect(screen.getByText("Generada por el asistente técnico")).toBeInTheDocument();
  });

  it("sesión de experto no muestra el badge", () => {
    render(<ListadoSesiones sesiones={[sesion({})]} onAbrir={vi.fn()} onCrear={vi.fn()} />);
    expect(screen.queryByText("Generada por el asistente técnico")).not.toBeInTheDocument();
  });
});
