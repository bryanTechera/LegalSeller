import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("sin mensaje elegido no carga ninguna fuente", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda(), busqueda({ spanId: "t2", messageId: "m3", consulta: "despido en licencia médica" })]}
        messageIdSeleccionado={null}
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getByText(/Elegí una respuesta del agente/)).toBeInTheDocument();
    expect(screen.queryByText("indemnización por despido antigüedad")).not.toBeInTheDocument();
    expect(screen.queryByText("despido en licencia médica")).not.toBeInTheDocument();
  });

  it("con una respuesta seleccionada muestra su consulta y sus fragmentos con score", () => {
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onAnotar={vi.fn()} />,
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
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onAnotar={onAnotar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre esta búsqueda/ }));
    expect(onAnotar).toHaveBeenCalledWith("m1", "Búsqueda: «indemnización por despido antigüedad»");
  });

  it("anotar un fragmento manda documento, sección y score como cita", () => {
    const onAnotar = vi.fn();
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onAnotar={onAnotar} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre este fragmento: Ley 10.489/ }));
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
       
        onAnotar={onAnotar}
      />,
    );
    // Verificar que cada fragmento tiene su botón distinto
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre este fragmento: Ley 10.489/ }));
    expect(onAnotar).toHaveBeenLastCalledWith(
      "m1",
      "Ley 10.489 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
    fireEvent.click(screen.getByRole("button", { name: /Dejar nota sobre este fragmento: Resolución 123/ }));
    expect(onAnotar).toHaveBeenLastCalledWith(
      "m1",
      "Resolución 123 — art. 4 (0.79): «El empleador que despida sin causa deberá abonar una indemnización.»",
    );
  });

  it("una sola búsqueda muestra sus fragmentos sin colapsar", () => {
    render(
      <PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m1" onAnotar={vi.fn()} />,
    );
    expect(screen.getByText("Ley 10.489 — art. 4")).toBeVisible();
  });

  it("con varias búsquedas en la misma respuesta solo se ven las consultas hasta expandir", () => {
    const otra = busqueda({
      spanId: "t2",
      consulta: "plazo para reclamar despido",
      fragmentos: [{ ...fragmento, documentId: "d2", documentTitle: "Ley 18.572" }],
    });
    render(
      <PanelFuentes
        busquedas={[busqueda(), otra]}
        messageIdSeleccionado="m1"
       
        onAnotar={vi.fn()}
      />,
    );

    // Las dos consultas están a la vista; sus resultados, no.
    expect(screen.getByText("indemnización por despido antigüedad")).toBeVisible();
    expect(screen.getByText("plazo para reclamar despido")).toBeVisible();
    expect(screen.getByText("Ley 18.572 — art. 4")).not.toBeVisible();

    // El resumen de la cabecera dice qué hay adentro sin abrirla.
    expect(screen.getAllByText("1 fragmento · mejor 0.79")).toHaveLength(2);

    fireEvent.click(screen.getByText("plazo para reclamar despido"));
    expect(screen.getByText("Ley 18.572 — art. 4")).toBeVisible();
  });

  it("los fragmentos se numeran por score, de mayor a menor", () => {
    const bajo = { ...fragmento, documentId: "d2", documentTitle: "Resolución 123", similarity: 0.41 };
    render(
      <PanelFuentes
        busquedas={[busqueda({ fragmentos: [bajo, fragmento] })]}
        messageIdSeleccionado="m1"
       
        onAnotar={vi.fn()}
      />,
    );

    const [primero, segundo] = screen.getAllByRole("article");
    expect(within(primero).getByText("1")).toBeInTheDocument();
    expect(within(primero).getByText("0.79")).toBeInTheDocument();
    expect(within(primero).getByText("Ley 10.489 — art. 4")).toBeInTheDocument();
    expect(within(segundo).getByText("2")).toBeInTheDocument();
    expect(within(segundo).getByText("0.41")).toBeInTheDocument();
    expect(within(segundo).getByText("Resolución 123 — art. 4")).toBeInTheDocument();
  });

  it("una respuesta sin búsquedas lo dice", () => {
    render(<PanelFuentes busquedas={[busqueda()]} messageIdSeleccionado="m9" onAnotar={vi.fn()} />);
    expect(screen.getByText("Esta respuesta no consultó el corpus.")).toBeInTheDocument();
  });

  // Una búsqueda huérfana (span sin mensaje) no pertenece a ninguna respuesta:
  // el panel no la muestra por error bajo la que esté elegida. Que exista se
  // reporta aparte, en el detalle técnico del board.
  it("una búsqueda huérfana no se cuela en la respuesta elegida", () => {
    render(
      <PanelFuentes
        busquedas={[busqueda({ messageId: null }), busqueda({ spanId: "t2", messageId: "m1" })]}
        messageIdSeleccionado="m1"
        onAnotar={vi.fn()}
      />,
    );
    expect(screen.getAllByText("indemnización por despido antigüedad")).toHaveLength(1);
  });
});
