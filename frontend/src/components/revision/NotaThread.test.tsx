import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NotaConRespuestas } from "@/lib/revision/notas";

import { NotaThread } from "./NotaThread";

const notaBase: NotaConRespuestas = {
  id: "n1",
  messageId: "m1",
  citaTexto: "seis mensualidades",
  autor: "Dra. García",
  texto: "El tope son 6, revisar.",
  estado: "ABIERTA",
  createdAt: "2026-07-20T12:00:00.000Z",
  respuestas: [],
};

describe("NotaThread", () => {
  it("nota abierta: chip, cita y texto visibles", () => {
    render(<NotaThread nota={notaBase} onResponder={vi.fn()} onResolver={vi.fn()} />);
    expect(screen.getByText("Abierta")).toBeInTheDocument();
    expect(screen.getByText("seis mensualidades")).toBeInTheDocument();
    expect(screen.getByText("El tope son 6, revisar.")).toBeInTheDocument();
  });

  it("responder: expande el input, envía y limpia", async () => {
    const onResponder = vi.fn().mockResolvedValue(true);
    render(<NotaThread nota={notaBase} onResponder={onResponder} onResolver={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Responder…" }));
    fireEvent.change(screen.getByLabelText("Responder la nota"), { target: { value: "corregido" } });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    expect(onResponder).toHaveBeenCalledWith("n1", "corregido");
    expect(await screen.findByRole("button", { name: "Responder…" })).toBeInTheDocument();
  });

  it("responder que falla: muestra error y conserva el texto", async () => {
    const onResponder = vi.fn().mockResolvedValue(false);
    render(<NotaThread nota={notaBase} onResponder={onResponder} onResolver={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Responder…" }));
    fireEvent.change(screen.getByLabelText("Responder la nota"), { target: { value: "corregido" } });
    fireEvent.click(screen.getByRole("button", { name: "Responder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos enviar la respuesta");
    expect(screen.getByLabelText("Responder la nota")).toHaveValue("corregido");
  });

  it("resuelta: colapsada a una línea, expandible", () => {
    const resuelta: NotaConRespuestas = {
      ...notaBase,
      estado: "RESUELTA",
      respuestas: [{ id: "r1", origen: "DEV", autor: "Equipo", texto: "listo", createdAt: "2026-07-20T13:00:00.000Z" }],
    };
    render(<NotaThread nota={resuelta} onResponder={vi.fn()} onResolver={vi.fn()} />);
    expect(screen.queryByText("El tope son 6, revisar.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resuelta · 1 respuesta/ }));
    expect(screen.getByText("El tope son 6, revisar.")).toBeInTheDocument();
    expect(screen.getByText("listo")).toBeInTheDocument();
  });
});
