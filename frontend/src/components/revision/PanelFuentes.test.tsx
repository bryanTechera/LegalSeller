import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BusquedaCorpus } from "@/lib/revision/fuentes";

import { PanelFuentes } from "./PanelFuentes";

const fragmento = {
  documentId: "d1",
  documentTitle: "Ley 10.489",
  section: "art. 4",
  content: "El empleador que despida sin causa deberá abonar una indemnización.",
  similarity: 0.7912,
};

function busqueda(sobreescribir: Partial<BusquedaCorpus> = {}): BusquedaCorpus {
  return {
    spanId: "t1",
    messageId: "m1",
    agente: "laboral",
    consulta: "indemnización por despido antigüedad",
    categoria: "laboral",
    subcategorias: ["despido"],
    estado: "ok",
    fragmentos: [fragmento],
    fecha: "2026-08-04T10:00:00.000Z",
    ...sobreescribir,
  };
}

describe("PanelFuentes", () => {
  it("sin búsquedas dice que el chat no consultó el corpus", () => {
    render(<PanelFuentes busquedas={[]} messageIdSeleccionado={null} onIrARespuesta={vi.fn()} onAnotar={vi.fn()} />);
    expect(screen.getByText("Este chat no consultó el corpus.")).toBeInTheDocument();
  });

  it("sin respuesta seleccionada muestra el mapa con el contador y las vacías", () => {
    const onIrARespuesta = vi.fn();
    render(
      <PanelFuentes
        busquedas={[busqueda(), busqueda({ spanId: "t2", messageId: "m3", consulta: "despido en licencia médica", estado: "empty", fragmentos: [] })]}
        messageIdSeleccionado={null}
        onIrARespuesta={onIrARespuesta}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getByText("1 de 2 consultas volvió sin fuentes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /despido en licencia médica/ }));
    expect(onIrARespuesta).toHaveBeenCalledWith("m3");
  });

  it("con una respuesta seleccionada muestra su consulta y sus fragmentos con score", () => {
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onIrARespuesta={vi.fn()} onAnotar={vi.fn()} />,
    );
    expect(screen.getByText("indemnización por despido antigüedad")).toBeInTheDocument();
    expect(screen.getByText("Ley 10.489 — art. 4")).toBeInTheDocument();
    expect(screen.getByText("0.79")).toBeInTheDocument();
  });

  it("una búsqueda vacía nombra la categoría y NO muestra el número del umbral", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda({ estado: "empty", fragmentos: [] })]}
        messageIdSeleccionado="m1"
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    const alerta = screen.getByRole("status");
    expect(alerta).toHaveTextContent("ningún fragmento del corpus de laboral superó el umbral de relevancia");
    expect(alerta.textContent).not.toMatch(/0\.\d/);
  });

  it("una búsqueda ilegible lo dice sin romper la lista", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda({ estado: "ilegible", fragmentos: [] }), busqueda({ spanId: "t2" })]}
        messageIdSeleccionado="m1"
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getByText(/No pudimos leer el resultado de esta búsqueda/)).toBeInTheDocument();
    expect(screen.getByText("Ley 10.489 — art. 4")).toBeInTheDocument();
  });

  it("un fragmento largo se recorta y se expande con ver más", () => {
    const largo = { ...fragmento, content: `${"a".repeat(500)}FINAL` };
    render(
      <PanelFuentes
        busquedas={[busqueda({ fragmentos: [largo] })]}
        messageIdSeleccionado="m1"
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.queryByText(/FINAL/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver más/ }));
    expect(screen.getByText(/FINAL/)).toBeInTheDocument();
  });

  it("anotar una búsqueda manda la consulta como cita", () => {
    const onAnotar = vi.fn();
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onIrARespuesta={vi.fn()} onAnotar={onAnotar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre la búsqueda/ }));
    expect(onAnotar).toHaveBeenCalledWith("m1", "Búsqueda: «indemnización por despido antigüedad»");
  });

  it("anotar un fragmento manda documento, sección y score como cita", () => {
    const onAnotar = vi.fn();
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onIrARespuesta={vi.fn()} onAnotar={onAnotar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre el fragmento de Ley 10.489/ }));
    expect(onAnotar).toHaveBeenCalledWith(
      "m1",
      "Ley 10.489 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("múltiples fragmentos distintos tienen botones accesibles sin ambigüedad", () => {
    const fragmento1 = { ...fragmento, documentId: "d1", documentTitle: "Ley 10.489" };
    const fragmento2 = { ...fragmento, documentId: "d2", documentTitle: "Resolución 123" };
    const onAnotar = vi.fn();
    render(
      <PanelFuentes
        busquedas={[busqueda({ fragmentos: [fragmento1, fragmento2] })]}
        messageIdSeleccionado="m1"
        onIrARespuesta={vi.fn()}
        onAnotar={onAnotar}
      />,
    );
    // Verificar que cada fragmento tiene su botón distinto
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre el fragmento de Ley 10.489/ }));
    expect(onAnotar).toHaveBeenLastCalledWith(
      "m1",
      "Ley 10.489 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre el fragmento de Resolución 123/ }));
    expect(onAnotar).toHaveBeenLastCalledWith(
      "m1",
      "Resolución 123 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("una respuesta sin búsquedas lo dice y deja volver al mapa", () => {
    const onIrARespuesta = vi.fn();
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m9" onIrARespuesta={onIrARespuesta} onAnotar={vi.fn()} />,
    );
    expect(screen.getByText("Esta respuesta no consultó el corpus.")).toBeInTheDocument();
  });

  it("las búsquedas huérfanas aparecen en el mapa marcadas", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda({ messageId: null })]}
        messageIdSeleccionado={null}
        onIrARespuesta={vi.fn()}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getByText("sin respuesta asociada")).toBeInTheDocument();
  });
});
