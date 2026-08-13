import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  // Los tests de guardado stubean fetch global: sin desestubearlo se filtra a
  // los tests que corren después dentro del mismo archivo.
  afterEach(() => vi.unstubAllGlobals());

  const gestionActualizada: GestionCaso = {
    estado: "CONTACTADO",
    nota: "La llamé.",
    por: "ana@estudio.uy",
    en: "2026-08-12T12:00:00.000Z",
    historial: [],
  };

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

  it("no guarda al elegir un estado: el PATCH sale recién con Guardar cambio", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ gestion: gestionActualizada }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onGuardado } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));
    fireEvent.change(screen.getByLabelText("Nota del cambio (opcional)"), {
      target: { value: "La llamé." },
    });

    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/casos/caso-1/gestion",
      expect.objectContaining({ method: "PATCH" }),
    );
    const [, opciones] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(opciones.body)).toEqual({ gestion: "CONTACTADO", nota: "La llamé." });

    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(gestionActualizada));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  // Guardar el estado que ya está vigente escribiría un evento "X → X" en un
  // trail append-only: ruido que después hay que saltear al leer la historia.
  it("deja Guardar cambio deshabilitado mientras la selección es el estado vigente", () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));

    expect(screen.getByRole("button", { name: "Guardar cambio" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Derivado" }));

    expect(screen.getByRole("button", { name: "Guardar cambio" })).not.toBeDisabled();
  });

  // Un cambio que no se guardó y no avisa es peor que uno que falla ruidoso: el
  // equipo cree que el lead quedó marcado y nadie lo vuelve a mirar.
  it("si el PATCH responde no-ok, el modal queda abierto con el aviso y la nota tipeada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { onGuardado } = montar();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));
    fireEvent.change(screen.getByLabelText("Nota del cambio (opcional)"), {
      target: { value: "La llamé." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));

    expect(await screen.findByText("No pudimos guardar el cambio. Probá de nuevo.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nota del cambio (opcional)")).toHaveValue("La llamé.");
    expect(onGuardado).not.toHaveBeenCalled();
  });

  // Sin el finally que rehabilita, un fallo de red deja el modal muerto y nadie
  // puede reintentar marcar el caso.
  it("si el PATCH rechaza, Guardar cambio se rehabilita", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar cambio" })).not.toBeDisabled(),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
