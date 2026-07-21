import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("mensaje del usuario: burbuja con su texto, sin firma Jurco", () => {
    render(<MessageBubble role="user" content="me despidieron ayer" />);
    expect(screen.getByLabelText("Tu mensaje")).toHaveTextContent("me despidieron ayer");
    expect(screen.queryByText("Jurco")).not.toBeInTheDocument();
  });

  it("respuesta del asistente: firma Jurco y markdown renderizado", () => {
    render(<MessageBubble role="assistant" content="El tope son **seis** sueldos" />);
    expect(screen.getByLabelText("Respuesta del asistente")).toBeInTheDocument();
    expect(screen.getByText("Jurco")).toBeInTheDocument();
    expect(screen.getByText("seis").tagName).toBe("STRONG");
  });

  it("muestra el indicador de búsqueda mientras streamea vacío", () => {
    render(<MessageBubble role="assistant" content="" showThinking />);
    expect(screen.getByText("Buscando en el corpus…")).toBeInTheDocument();
  });

  it("expone data-message-id para el anclaje de notas", () => {
    render(<MessageBubble role="assistant" content="hola" anchorId="msg-1" />);
    expect(screen.getByLabelText("Respuesta del asistente")).toHaveAttribute("data-message-id", "msg-1");
  });
});
