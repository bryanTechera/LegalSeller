# Ficha del caso: dos columnas y gestión en modal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reparte los bloques informativos de `/board/casos/[id]` en dos columnas y saca la gestión del lead a un modal detrás de un botón flotante, con guardado explícito.

**Architecture:** `ModalGestion` es un componente nuevo y cerrado (botón flotante + modal + PATCH + error), que recibe la gestión vigente por props y devuelve la actualizada por `onGuardado`. `DetalleCaso` se queda como único dueño del SWR y de los bloques informativos, ahora en una grilla de dos columnas. Nada del backend, el modelo de datos ni el contrato de la API cambia.

**Tech Stack:** Next 16 (App Router, client components), React 19, SWR 2, CSS Modules con los tokens de `app/globals.css`, Vitest + Testing Library (jsdom 27), Playwright.

**Spec:** `docs/plans/2026-08-12-ficha-caso-layout-gestion-modal.md`

## Global Constraints

- **Nunca `any`** — `unknown` + Zod; tipos con `z.infer`. Regla de `CLAUDE.md`.
- **Nunca `console.log`** en código de producción.
- **Prosa user-facing en español rioplatense** (vos en indicativo; subjuntivo en negación tuteante). Código en inglés camelCase; archivos y clases CSS en el idioma que ya usa el módulo (español).
- **jsdom 27.4.0 no implementa `HTMLDialogElement.showModal`** — verificado en este repo. El modal se construye con `div` + `role="dialog"`, nunca con `<dialog>` nativo.
- **Sin librerías nuevas.** No se agrega focus-trap, headless-ui ni radix: el proyecto no tiene ninguna y este cambio no la justifica.
- **Commits convencionales**, en español, con el trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Todos los comandos corren desde `frontend/`.

---

### Task 1: `ModalGestion` — botón flotante, apertura y cierre

**Files:**
- Create: `frontend/src/components/board/Casos/gestiones.ts`
- Create: `frontend/src/components/board/Casos/ModalGestion.tsx`
- Create: `frontend/src/components/board/Casos/ModalGestion.test.tsx`
- Modify: `frontend/src/components/board/Casos/casos.module.css` (agrega `.flotante`, `.overlay`, `.fondo`, `.modal`, `.cabeceraModal`, `.cerrar`, `.accionesModal`, `.botonSecundario`)

**Interfaces:**
- Consumes: `GestionCaso` de `@/lib/casos/gestion` (`{ estado, nota, por, en, historial }`, historial del más reciente al más viejo). Import de tipo: el módulo es `server-only` y el tipo se borra en compilación — mismo camino que ya usa `DetalleCaso.tsx` con `caso-detalle`.
- Produces:
  - `GESTIONES: readonly { valor: string; etiqueta: string }[]` y `etiquetaGestion(valor: string): string` desde `./gestiones`.
  - `ModalGestion({ casoId, gestion, onGuardado }: { casoId: string; gestion: GestionCaso; onGuardado: (gestion: GestionCaso) => void })` desde `./ModalGestion`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/components/board/Casos/ModalGestion.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm test:unit run src/components/board/Casos/ModalGestion.test.tsx`
Expected: FAIL — `Failed to resolve import "./ModalGestion"`.

- [ ] **Step 3: Escribir `gestiones.ts`**

```ts
/**
 * Catálogo de estados de gestión, compartido por la ficha (badge del
 * encabezado) y el modal (botones e historial). Vive suelto y no dentro de
 * `ModalGestion` para que el badge no tenga que importar el modal entero.
 */
export const GESTIONES = [
  { valor: "NUEVO", etiqueta: "Nuevo" },
  { valor: "CONTACTADO", etiqueta: "Contactado" },
  { valor: "DERIVADO", etiqueta: "Derivado" },
  { valor: "DESCARTADO", etiqueta: "Descartado" },
] as const;

/** El board se lee en español: el enum crudo (SCREAMING_SNAKE) nunca sale a pantalla. */
export function etiquetaGestion(valor: string): string {
  return GESTIONES.find((opcion) => opcion.valor === valor)?.etiqueta ?? valor;
}
```

- [ ] **Step 4: Escribir `ModalGestion.tsx` (sin guardado todavía)**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import type { GestionCaso } from "@/lib/casos/gestion";

import styles from "./casos.module.css";
import { GESTIONES, etiquetaGestion } from "./gestiones";

// El board se lee desde Uruguay; sin timeZone explícito, JS formatea con la
// zona del proceso (UTC en Railway) y todo horario queda corrido.
function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  casoId: string;
  gestion: GestionCaso;
  onGuardado: (gestion: GestionCaso) => void;
}

export function ModalGestion({ casoId, gestion, onGuardado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<string>(gestion.estado);
  const [nota, setNota] = useState("");
  const disparador = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const abrir = () => {
    // Cada apertura parte del estado vigente: una selección a medio elegir de
    // la vez anterior no puede sobrevivir a un cierre.
    setSeleccion(gestion.estado);
    setNota("");
    setAbierto(true);
  };

  const cerrar = () => {
    setAbierto(false);
    disparador.current?.focus();
  };

  useEffect(() => {
    if (!abierto) return;
    panel.current?.focus();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        setAbierto(false);
        disparador.current?.focus();
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  return (
    <>
      <button ref={disparador} type="button" className={styles.flotante} onClick={abrir}>
        Gestionar
      </button>

      {abierto ? (
        <div className={styles.overlay}>
          {/* El fondo es un botón para que el click cierre sin que jsx-a11y
              tenga que tragarse un div clickeable; queda fuera del árbol de
              accesibilidad porque la × y Cancelar ya son la salida anunciada. */}
          <button
            type="button"
            className={styles.fondo}
            aria-hidden="true"
            tabIndex={-1}
            onClick={cerrar}
          />
          <div
            ref={panel}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-gestion"
            tabIndex={-1}
          >
            <div className={styles.cabeceraModal}>
              <h2 className={styles.subtitulo} id="titulo-gestion">
                Gestión del caso
              </h2>
              <button type="button" className={styles.cerrar} onClick={cerrar} aria-label="Cerrar">
                ×
              </button>
            </div>
            <p className={styles.ayuda}>
              En qué anda este lead. Es independiente del estado que dejó la conversación.
            </p>

            <div className={styles.gestiones}>
              {GESTIONES.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  className={
                    seleccion === opcion.valor
                      ? `${styles.botonGestion} ${styles.botonGestionActivo}`
                      : styles.botonGestion
                  }
                  aria-pressed={seleccion === opcion.valor}
                  onClick={() => setSeleccion(opcion.valor)}
                >
                  {opcion.etiqueta}
                </button>
              ))}
            </div>

            <label className={styles.etiqueta} htmlFor="nota-gestion">
              Nota del cambio (opcional)
            </label>
            <input
              id="nota-gestion"
              className={styles.input}
              value={nota}
              onChange={(evento) => setNota(evento.target.value)}
              placeholder="Por qué cambiás el estado"
            />

            <div className={styles.accionesModal}>
              <button type="button" className={styles.botonSecundario} onClick={cerrar}>
                Cancelar
              </button>
            </div>

            <h3 className={styles.tituloBloque}>Historial</h3>
            {gestion.historial.length === 0 ? (
              <p className={styles.etiqueta}>Todavía nadie gestionó este caso.</p>
            ) : (
              <ul className={styles.notas}>
                {gestion.historial.map((cambio) => (
                  <li key={cambio.id}>
                    <p className={styles.etiqueta}>
                      {cambio.de
                        ? `${etiquetaGestion(cambio.de)} → ${etiquetaGestion(cambio.a)}`
                        : etiquetaGestion(cambio.a)}{" "}
                      · {cambio.por} · {fecha(cambio.createdAt)}
                    </p>
                    {cambio.nota ? <p>{cambio.nota}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 5: Agregar los estilos del botón flotante y el modal**

Al final de `frontend/src/components/board/Casos/casos.module.css`:

```css
/* El botón vive fijo al viewport y no en el flujo de la ficha: la acción tiene
   que estar a un click desde cualquier punto del scroll. */
.flotante {
  position: fixed;
  right: var(--space-6);
  bottom: var(--space-6);
  z-index: 20;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  padding: var(--space-3) var(--space-6);
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-navy);
  box-shadow: var(--shadow-raised);
  cursor: pointer;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: var(--space-4);
}

.fondo {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  /* Mismo triplete que las sombras del proyecto (--shadow-raised). */
  background: rgb(19 42 59 / 45%);
  cursor: pointer;
}

.modal {
  position: relative;
  display: grid;
  gap: var(--space-3);
  width: min(34rem, 100%);
  max-height: 85dvh;
  overflow-y: auto;
  padding: var(--space-6);
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-raised);
}

.cabeceraModal {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.cerrar {
  font: inherit;
  font-size: var(--text-lg);
  line-height: 1;
  padding: 0 var(--space-1);
  border: 0;
  background: transparent;
  color: var(--ink-500);
  cursor: pointer;
}

.accionesModal {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.botonSecundario {
  font: inherit;
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--ink-300);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-900);
  cursor: pointer;
}
```

- [ ] **Step 6: Correr los tests hasta verde**

Run: `pnpm test:unit run src/components/board/Casos/ModalGestion.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/board/Casos/gestiones.ts src/components/board/Casos/ModalGestion.tsx \
        src/components/board/Casos/ModalGestion.test.tsx src/components/board/Casos/casos.module.css
git commit -m "feat(board): modal de gestión del caso detrás de un botón flotante"
```

---

### Task 2: `ModalGestion` — guardado explícito y errores

**Files:**
- Modify: `frontend/src/components/board/Casos/ModalGestion.tsx`
- Modify: `frontend/src/components/board/Casos/ModalGestion.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/board/casos/:id/gestion` con body `{ gestion, nota }`, que responde `{ gestion: GestionCaso }` (contrato ya existente, definido en `docs/plans/2026-08-11-board-casos.md` §4.3).
- Produces: nada nuevo hacia afuera — `onGuardado` ya estaba en la firma de Task 1 y recién acá se invoca.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar dentro del `describe("ModalGestion")` de `ModalGestion.test.tsx`:

```tsx
  const gestionActualizada: GestionCaso = {
    estado: "CONTACTADO",
    nota: "La llamé.",
    por: "ana@estudio.uy",
    en: "2026-08-12T12:00:00.000Z",
    historial: [],
  };

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
```

Y ampliar el import de Testing Library al tope del archivo:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

Los tests nuevos stubean `fetch`, así que el `describe` suma un `afterEach` —mismo criterio que `DetalleCaso.test.tsx`— junto al `beforeEach` que ya existe:

```tsx
  afterEach(() => vi.unstubAllGlobals());
```

con `afterEach` agregado al import de vitest.

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test:unit run src/components/board/Casos/ModalGestion.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Guardar cambio"`.

- [ ] **Step 3: Implementar el guardado**

En `ModalGestion.tsx`, sumar estado y handler debajo de los `useState` existentes:

```tsx
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);
```

`abrir` limpia también el error:

```tsx
  const abrir = () => {
    setSeleccion(gestion.estado);
    setNota("");
    setError(false);
    setAbierto(true);
  };
```

`cerrar` no interrumpe un guardado en curso:

```tsx
  const cerrar = () => {
    if (guardando) return;
    setAbierto(false);
    disparador.current?.focus();
  };
```

Y el handler del PATCH:

```tsx
  const guardar = async () => {
    setGuardando(true);
    try {
      const response = await fetch(`/api/board/casos/${casoId}/gestion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gestion: seleccion, nota }),
      });
      if (response.ok) {
        const { gestion: actualizada } = (await response.json()) as { gestion: GestionCaso };
        onGuardado(actualizada);
        // Cierra sin pasar por `cerrar`, que se niega mientras `guardando`
        // sigue en true (recién baja en el finally).
        setAbierto(false);
        disparador.current?.focus();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setGuardando(false);
    }
  };
```

El `useEffect` de Escape usa el mismo guard, para no cerrar a mitad de un guardado:

```tsx
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape" || guardando) return;
      setAbierto(false);
      disparador.current?.focus();
    };
```

con `guardando` sumado a las dependencias: `}, [abierto, guardando]);`

Los botones de estado y el input se deshabilitan mientras guarda (`disabled={guardando}` en cada `<button>` del `map` y en el `<input>`), y el bloque de acciones pasa a:

```tsx
            {error ? (
              <p role="status" className={styles.aviso}>
                No pudimos guardar el cambio. Probá de nuevo.
              </p>
            ) : null}

            <div className={styles.accionesModal}>
              <button
                type="button"
                className={styles.botonSecundario}
                onClick={cerrar}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.boton}
                onClick={() => void guardar()}
                disabled={guardando || seleccion === gestion.estado}
              >
                {guardando ? "Guardando…" : "Guardar cambio"}
              </button>
            </div>
```

- [ ] **Step 4: Correr los tests hasta verde**

Run: `pnpm test:unit run src/components/board/Casos/ModalGestion.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/board/Casos/ModalGestion.tsx src/components/board/Casos/ModalGestion.test.tsx
git commit -m "feat(board): guardado explícito del cambio de gestión en el modal"
```

---

### Task 3: La ficha en dos columnas, sin el bloque de gestión inline

**Files:**
- Modify: `frontend/src/components/board/Casos/DetalleCaso.tsx`
- Modify: `frontend/src/components/board/Casos/DetalleCaso.test.tsx`
- Modify: `frontend/src/components/board/Casos/casos.module.css`

**Interfaces:**
- Consumes: `ModalGestion` y `etiquetaGestion` de Task 1.
- Produces: la ficha renderizada — encabezado con `Gestión: <etiqueta>` y, si hay gestión registrada, `Marcado por <por> · <fecha>`; grilla `.columnas` con `.principal` (resumen + link al chat) y `.lateral` (contacto + notas).

- [ ] **Step 1: Reescribir los tests de gestión de `DetalleCaso.test.tsx`**

Los cinco tests que hoy ejercitan el bloque inline (`"muestra el estado de gestión y permite cambiarlo"`, `"avisa cuando el cambio de gestión falla"`, `"si el PATCH de gestión rechaza…"`, `"lista los cambios anteriores…"`, `"muestra el historial de gestión con etiquetas legibles…"`, líneas 144-275) se **borran**: su comportamiento ya está cubierto por `ModalGestion.test.tsx`. En su lugar van dos tests sobre lo que la ficha sí sigue siendo responsable — el resumen en el encabezado y el cableado del `onGuardado`:

```tsx
  it("muestra el estado de gestión y quién lo dejó así en el encabezado", () => {
    mockCaso({
      ...casoBase,
      gestion: {
        estado: "CONTACTADO",
        nota: "La llamé.",
        por: "ana@estudio.uy",
        en: "2026-08-11T12:00:00.000Z",
        historial: [],
      },
    });
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("Gestión: Contactado")).toBeInTheDocument();
    expect(screen.getByText(/Marcado por ana@estudio\.uy/)).toBeInTheDocument();
  });

  it("un caso sin gestionar muestra el badge pero no la línea de autor", () => {
    mockCaso(casoBase);
    render(<DetalleCaso id="caso-1" />);

    expect(screen.getByText("Gestión: Nuevo")).toBeInTheDocument();
    expect(screen.queryByText(/Marcado por/)).not.toBeInTheDocument();
  });

  // La ficha es la dueña del SWR: consume la respuesta del PATCH que le pasa el
  // modal en vez de revalidar el caso entero, que volvería a pasar por
  // obtenerCaso -> asegurarSintesis -> construirTimeline para un badge.
  it("aplica la gestión que devuelve el modal sin revalidar el caso entero", async () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: casoBase,
      error: undefined,
      isLoading: false,
      mutate,
    } as unknown as ReturnType<typeof useSWR>);
    const gestionActualizada = {
      estado: "CONTACTADO" as const,
      nota: null,
      por: "ana@estudio.uy",
      en: "2026-08-11T12:00:00.000Z",
      historial: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ gestion: gestionActualizada }),
      }),
    );

    render(<DetalleCaso id="caso-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Contactado" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    const [actualizador, opcionesMutate] = mutate.mock.calls[0] as [
      (previo: Caso | undefined) => Caso | undefined,
      { revalidate: boolean },
    ];
    expect(opcionesMutate).toEqual({ revalidate: false });
    expect(actualizador(casoBase)).toEqual({ ...casoBase, gestion: gestionActualizada });
    expect(actualizador(undefined)).toBeUndefined();
  });
```

El import de `within` queda sin uso al borrar los tests viejos: sacarlo del import de Testing Library (`@typescript-eslint/no-unused-vars` lo marca como error).

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `pnpm test:unit run src/components/board/Casos/DetalleCaso.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Gestión: Contactado`.

- [ ] **Step 3: Reestructurar `DetalleCaso.tsx`**

1. **Borrar** de la cabecera del componente: la constante local `GESTIONES`, la función local `etiquetaGestion`, los estados `notaGestion`, `cambiandoGestion`, `errorGestion` y la función `cambiarGestion` completa (líneas 17-22, 37-40, 51-53, 55-82 del archivo actual).
2. **Importar** lo nuevo:

```tsx
import { ModalGestion } from "./ModalGestion";
import { etiquetaGestion } from "./gestiones";
```

3. **Agregar** el handler que aplica lo que devuelve el modal:

```tsx
  const alGuardarGestion = (gestion: Caso["gestion"]) => {
    void mutate((previo) => (previo ? { ...previo, gestion } : previo), { revalidate: false });
  };
```

4. **Borrar** el `<section aria-labelledby="caso-gestion">` completo (líneas 223-272 del archivo actual).
5. **Reemplazar** el encabezado y envolver los bloques en la grilla. El JSX del resumen, el contacto y las notas se mueve **tal cual**, sin editar su contenido — lo único que cambia es qué lo envuelve:

```tsx
  return (
    <section className={styles.caso}>
      <header className={styles.encabezado}>
        <Link href="/board/casos" className={styles.link}>← Casos</Link>
        <div className={styles.filaEncabezado}>
          <h1 className={styles.titulo}>{data.categoria ?? "Pedido fuera de cobertura"}</h1>
          {/* El badge dice "Gestión:" porque al lado convive el estado que dejó
              el agente ("captado"): son dos ejes distintos y una píldora suelta
              con "Contactado" se lee como si fueran el mismo. */}
          <span className={styles.badgeGestion}>Gestión: {etiquetaGestion(data.gestion.estado)}</span>
        </div>
        <p className={styles.etiqueta}>
          {data.subcategorias.join(" · ") || "sin subcategorías"} — {data.estado.replace(/_/g, " ").toLowerCase()}
        </p>
        {data.gestion.por && data.gestion.en ? (
          <p className={styles.etiqueta}>Marcado por {data.gestion.por} · {fecha(data.gestion.en)}</p>
        ) : null}
        <p className={styles.etiqueta}>
          Abierto el {fecha(data.creadoEn)} · última actividad {fecha(data.actualizadoEn)}
        </p>
      </header>

      <div className={styles.columnas}>
        <div className={styles.principal}>
          <section className={styles.resumen} aria-labelledby="caso-resumen">
            {/* … el contenido del resumen queda igual … */}
          </section>

          <p className={styles.verificacion}>
            <Link href={`/board/chats/${data.conversationId}`} className={styles.link}>
              Ver chat completo
            </Link>{" "}
            — para verificar cualquier dato del resumen contra lo que dijo la persona.
          </p>
        </div>

        <aside className={styles.lateral}>
          <section className={styles.bloque} aria-labelledby="caso-contacto">
            {/* … el contacto queda igual … */}
          </section>

          <section className={styles.bloque} aria-labelledby="caso-notas">
            {/* … las notas quedan igual … */}
          </section>
        </aside>
      </div>

      <ModalGestion casoId={id} gestion={data.gestion} onGuardado={alGuardarGestion} />
    </section>
  );
```

6. Dentro del resumen, el `<dl>` de `sintesis.datosClave` pasa de `className={styles.datos}` a `className={styles.datosSintesis}`. El `<dl>` del contacto **no** se toca: en el lateral angosto tiene que seguir siendo de una columna.

- [ ] **Step 4: Agregar los estilos del layout**

En `casos.module.css`, cambiar el ancho de `.caso` y sumar las clases nuevas:

```css
.caso {
  display: grid;
  gap: var(--space-6);
  max-width: 76rem;
}

.columnas {
  display: grid;
  /* minmax(0, …) en la principal: sin él, un dato largo del resumen estira la
     columna y desborda la grilla (mismo motivo que el min-width: 0 de
     .contenido en board.module.css). */
  grid-template-columns: minmax(0, 2fr) minmax(17rem, 1fr);
  gap: var(--space-6);
  align-items: start;
}

.principal,
.lateral {
  display: grid;
  gap: var(--space-6);
  align-content: start;
  min-width: 0;
}

@media (width <= 64rem) {
  .columnas {
    grid-template-columns: 1fr;
  }
}

.filaEncabezado {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.badgeGestion {
  display: inline-block;
  padding: 2px 10px;
  border: 1px solid var(--accent-strong);
  border-radius: 999px;
  color: var(--accent-strong);
  font-size: var(--text-xs);
  font-weight: 600;
}

/* Los datos de la síntesis son pares cortos: en una columna gastan una fila
   entera por dos palabras y son lo que más alto suma en la ficha. */
.datosSintesis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
}

.datosSintesis dt {
  color: var(--ink-500);
  font-size: var(--text-xs);
}
```

Y sumar el tope de medida a la regla existente de `.situacion` (ensanchar la columna no puede arruinar la lectura):

```css
.situacion {
  font-family: var(--font-family-display);
  font-size: var(--text-lg);
  line-height: var(--line-height-base);
  color: var(--ink-900);
  max-width: 62ch;
}
```

- [ ] **Step 5: Correr los tests hasta verde**

Run: `pnpm test:unit run src/components/board/Casos/`
Expected: PASS — `DetalleCaso.test.tsx`, `ModalGestion.test.tsx` y `ListadoCasos.test.tsx` en verde.

- [ ] **Step 6: Commit**

```bash
git add src/components/board/Casos/DetalleCaso.tsx src/components/board/Casos/DetalleCaso.test.tsx \
        src/components/board/Casos/casos.module.css
git commit -m "refactor(board): la ficha del caso en dos columnas con la gestión fuera del flujo"
```

---

### Task 4: E2E y gates completos

**Files:**
- Modify: `frontend/tests/board.spec.ts:98-146`

**Interfaces:**
- Consumes: la ficha de Task 3 y el modal de Tasks 1-2.
- Produces: nada — es el gate.

- [ ] **Step 1: Actualizar el E2E de gestión**

En `tests/board.spec.ts`, el tramo que va desde el comentario "La ficha genera la síntesis…" (línea 101) hasta el cierre del test (línea 146) se reemplaza por:

```ts
  // La ficha genera la síntesis con IA al abrirse cuando no la tiene: el botón
  // de gestión se renderiza igual, no espera por eso.
  const gestionar = page.getByRole("button", { name: "Gestionar" });
  await expect(gestionar).toBeVisible({ timeout: 30_000 });

  // Esta fila es la primera de la bandeja REAL (esRevision = false): un lead
  // de un consultante de verdad, no un fixture. El PATCH que este test
  // dispara queda escrito en la base de prueba, así que hay que devolver el
  // caso a como estaba — de lo contrario el test marca a un consultante real
  // como "contactado" y el equipo lo saltea creyendo que alguien ya lo llamó
  // (el CasoEvento de auditoría queda igual, es append-only y está bien que
  // así sea; lo que no puede quedar es la gestión vigente pisada).
  const ETIQUETAS = ["Nuevo", "Contactado", "Derivado", "Descartado"] as const;

  /** El modal abre con el estado vigente seleccionado: eso lo delata. */
  async function estadoVigente(): Promise<(typeof ETIQUETAS)[number]> {
    const dialogo = page.getByRole("dialog");
    for (const etiqueta of ETIQUETAS) {
      if ((await dialogo.getByRole("button", { name: etiqueta }).getAttribute("aria-pressed")) === "true") {
        return etiqueta;
      }
    }
    // Todo caso tiene gestión (el default es "Nuevo"), así que siempre hay un
    // botón presionado — el fallback es solo para no colgar el test si un
    // cambio de UI rompe aria-pressed en vez de fallar con un mensaje claro.
    return "Nuevo";
  }

  async function guardarGestion(destino: (typeof ETIQUETAS)[number]) {
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: destino }).click();
    await dialogo.getByRole("button", { name: "Guardar cambio" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
  }

  await gestionar.click();
  const original = await estadoVigente();
  const destino = ETIQUETAS.find((etiqueta) => etiqueta !== original)!;

  try {
    await guardarGestion(destino);
    await expect(page.getByText(`Gestión: ${destino}`)).toBeVisible({ timeout: 15_000 });

    // El cambio tiene que sobrevivir a la recarga: si solo vive en el estado
    // del cliente, el PATCH no llegó a la base y nadie se entera.
    await page.reload();
    await expect(page.getByText(`Gestión: ${destino}`)).toBeVisible({ timeout: 30_000 });
  } finally {
    // Restaura el estado original SIEMPRE, incluso si una aserción de arriba
    // falló — un lead real no puede quedar marcado por una corrida de test.
    await page.getByRole("button", { name: "Gestionar" }).click();
    await guardarGestion(original);
    await expect(page.getByText(`Gestión: ${original}`)).toBeVisible({ timeout: 15_000 });
  }
});
```

- [ ] **Step 2: Correr los gates estáticos**

Run: `pnpm typecheck && pnpm lint`
Expected: los dos en verde. `pnpm lint` es el que caza el `within` sin usar y cualquier `any`.

- [ ] **Step 3: Correr los tests unitarios completos**

Run: `pnpm test:unit run`
Expected: PASS — toda la suite, no solo `Casos/`.

- [ ] **Step 4: Correr el E2E del board**

Requiere Postgres local arriba y el dev server (`pnpm dev`) con `frontend/.env` apuntando a la misma base que usa el board; `AUTH_SECRET` y `ALLOWED_EMAILS` tienen que existir en `frontend/.env` o los specs del board se saltean solos en silencio.

Run: `pnpm test tests/board.spec.ts tests/casos.spec.ts`
Expected: PASS. Si la bandeja no tiene casos, el test se saltea con el motivo explícito "Sin casos captados en la base de prueba" — eso NO cuenta como verde para este cambio: hay que sembrar o apuntar a una base con al menos un caso captado.

- [ ] **Step 5: Verificación visual y commit**

Levantar `pnpm dev`, abrir `/board/casos/<id>` y sacar capturas al tamaño del viewport (no `fullPage`: redimensiona y rompe animaciones, gotcha documentado en `CLAUDE.md`) de la ficha y del modal abierto. Mostrárselas al usuario **antes** de cualquier push.

```bash
git add tests/board.spec.ts
git commit -m "test(board): el E2E de gestión opera sobre el modal"
```

---

## Notas de implementación

- **Orden de las tasks**: 1 → 2 → 3 → 4. La 3 depende del componente que crean la 1 y la 2; la 4 depende de la 3.
- **Lo que NO se toca**: `lib/casos/gestion.ts`, `app/api/board/casos/**`, `lib/board/casos.ts`, `ListadoCasos.tsx`, el schema de Prisma y `src/proxy.ts`.
- **`pnpm evals` no corresponde**: no hay cambios de prompts, corpus ni tools.
