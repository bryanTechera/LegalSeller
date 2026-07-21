import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Composer } from "./Composer";

function renderComposer(overrides: Partial<React.ComponentProps<typeof Composer>> = {}) {
  const props = {
    value: "hola",
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    isStreaming: false,
    placeholder: "Escribí…",
    label: "Escribí tu consulta",
    inputId: "test-input",
    ...overrides,
  };
  render(<Composer {...props} />);
  return props;
}

describe("Composer", () => {
  it("Enter envía; Shift+Enter no", () => {
    const props = renderComposer();
    const input = screen.getByLabelText("Escribí tu consulta");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("streaming con onStop: muestra el botón de detener", () => {
    const onStop = vi.fn();
    renderComposer({ isStreaming: true, onStop });
    fireEvent.click(screen.getByLabelText("Detener la respuesta"));
    expect(onStop).toHaveBeenCalled();
  });

  it("streaming sin onStop: el botón de enviar queda deshabilitado", () => {
    renderComposer({ isStreaming: true });
    expect(screen.getByLabelText("Enviar la consulta")).toBeDisabled();
  });

  it("sin texto: enviar deshabilitado", () => {
    renderComposer({ value: "   " });
    expect(screen.getByLabelText("Enviar la consulta")).toBeDisabled();
  });
});
