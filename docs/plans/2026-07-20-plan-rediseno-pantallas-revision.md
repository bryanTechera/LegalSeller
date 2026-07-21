# Rediseño de Pantallas de Revisión — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las pantallas de `/revision` reutilizan las primitivas visuales del chat real (`MessageBubble`, `Composer` extraídas de `ChatPanel`) y las notas del equipo legal se muestran inline estilo GitHub (ancladas por selección de texto, con hilos, estados y colapso de resueltas).

**Architecture:** Enfoque A del spec (`docs/plans/2026-07-20-rediseno-pantallas-revision.md`): se extraen dos componentes presentacionales puros de `ChatPanel` que consumen ambas pantallas; `SesionView` se reescribe alrededor de ellos con el sistema de anotación inline; `revision.module.css` se reescribe completo sobre los tokens de `globals.css`. Cero cambios de schema/API.

**Tech Stack:** Next.js App Router, React 19, CSS Modules + design tokens, react-markdown + remark-gfm, Vitest + Testing Library (jsdom), Playwright.

## Global Constraints

- **Cero cambios** en schema Prisma, endpoints de `/api/revision/*` y máquina de estados de notas (spec §4).
- **El home (`/`) debe quedar visualmente idéntico** tras la extracción de primitivas (spec §2, criterio de éxito).
- Solo tokens del design system de `frontend/src/app/globals.css` (`--navy`, `--ink-*`, `--accent*`, `--state-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--text-*`, `--font-family-*`) — sin colores hex hardcodeados en CSS nuevo.
- `citaTexto` ≤ **2000** caracteres (límite de `crearNotaSchema`); mensajes ≤ **4000** (`MAX_MESSAGE_LENGTH`).
- Copy user-facing en español rioplatense; código inglés camelCase salvo los nombres ya en español del módulo de revisión (se respetan los existentes); NUNCA `any`; NUNCA `console.log`.
- Conventional commits; `pnpm typecheck && pnpm lint && pnpm test:unit run` verdes antes de cada commit.
- **Working directory:** `/home/bryan/LegalSeller/.claude/worktrees/sesion-aislada` (worktree aislado — no tocar el checkout principal). Todos los comandos `pnpm` de frontend corren en `<worktree>/frontend`.

---

### Task 1: Extraer `MessageBubble` como primitiva compartida

**Files:**
- Create: `frontend/src/components/chat/MessageBubble/MessageBubble.tsx`
- Create: `frontend/src/components/chat/MessageBubble/MessageBubble.module.css`
- Create: `frontend/src/components/chat/MessageBubble/index.ts`
- Create: `frontend/src/components/chat/MessageBubble/MessageBubble.test.tsx`
- Modify: `frontend/src/components/chat/ChatPanel/ChatPanel.tsx`
- Modify: `frontend/src/components/chat/ChatPanel/ChatPanel.module.css`

**Interfaces:**
- Consumes: `BrandMark` (`@/components/brand/BrandMark`), react-markdown, remark-gfm.
- Produces: `MessageBubble` con props `{ role: "user" | "assistant"; content: string; showThinking?: boolean; anchorId?: string }`. `anchorId` se emite como atributo `data-message-id` en el `<article>` (lo usan la Task 3 y la Task 6 para el anclaje de notas). Task 6 lo importa desde `@/components/chat/MessageBubble`.

- [ ] **Step 0: Setup del worktree (una sola vez para todo el plan)**

El worktree no tiene `node_modules` ni `.env` de frontend; se symlinkean del checkout principal (mismas dependencias — el lockfile no cambia en este plan):

```bash
cd /home/bryan/LegalSeller/.claude/worktrees/sesion-aislada
[ -e frontend/node_modules ] || ln -s /home/bryan/LegalSeller/frontend/node_modules frontend/node_modules
[ -e frontend/.env ] || ln -s /home/bryan/LegalSeller/frontend/.env frontend/.env
EXCLUDE="$(git rev-parse --git-common-dir)/info/exclude"
grep -qxF "frontend/node_modules" "$EXCLUDE" || echo "frontend/node_modules" >> "$EXCLUDE"
grep -qxF "frontend/.env" "$EXCLUDE" || echo "frontend/.env" >> "$EXCLUDE"
cd frontend && pnpm test:unit run 2>&1 | tail -3
```

Expected: la suite existente pasa (los symlinks resuelven). Si `pnpm test:unit` falla acá, detenerse y reportar BLOCKED.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/components/chat/MessageBubble/MessageBubble.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && pnpm test:unit run src/components/chat/MessageBubble`
Expected: FAIL — `Cannot find module './MessageBubble'` (o equivalente).

- [ ] **Step 3: Implementar el componente**

Crear `frontend/src/components/chat/MessageBubble/MessageBubble.tsx`:

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { BrandMark } from "@/components/brand/BrandMark";

import styles from "./MessageBubble.module.css";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  /** Indicador "Buscando en el corpus…" (assistant streameando sin contenido aún). */
  showThinking?: boolean;
  /** Se emite como data-message-id — anclaje de notas en la pantalla de revisión. */
  anchorId?: string;
}

/**
 * Burbuja de mensaje del chat — presentación pura, compartida por el chat real
 * (ChatPanel) y el chat de revisión (SesionView). Todo cambio visual acá
 * afecta AMBAS pantallas.
 */
export function MessageBubble({ role, content, showThinking = false, anchorId }: MessageBubbleProps) {
  return (
    <article
      className={role === "user" ? styles.userMessage : styles.assistantMessage}
      aria-label={role === "user" ? "Tu mensaje" : "Respuesta del asistente"}
      data-message-id={anchorId}
    >
      {role === "assistant" ? (
        <>
          <span className={styles.assistantHeader} aria-hidden="true">
            <span className={styles.assistantAvatar}>
              <BrandMark size={14} />
            </span>
            <span className={styles.assistantName}>Jurco</span>
          </span>
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            {showThinking ? <span className={styles.thinking}>Buscando en el corpus…</span> : null}
          </div>
        </>
      ) : (
        <p>{content}</p>
      )}
    </article>
  );
}
```

Crear `frontend/src/components/chat/MessageBubble/index.ts`:

```ts
export { MessageBubble } from "./MessageBubble";
```

Crear `frontend/src/components/chat/MessageBubble/MessageBubble.module.css` — el contenido son las clases **movidas tal cual** de `ChatPanel.module.css` (byte-igual, para paridad visual), más el bloque de animación del thinking:

```css
.userMessage {
  align-self: flex-end;
  max-width: 78%;
  background: var(--navy);
  color: var(--on-navy);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  border-end-end-radius: var(--radius-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Respuesta del agente como tarjeta tipo dictamen, con firma de marca. */
.assistantMessage {
  align-self: flex-start;
  max-width: 95%;
  color: var(--ink-900);
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-lg);
  border-start-start-radius: var(--radius-sm);
  box-shadow: var(--shadow-soft);
  padding: var(--space-4);
}

.assistantHeader {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.assistantAvatar {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  background: var(--navy);
  color: var(--on-navy);
  border-radius: var(--radius-sm);
}

.assistantName {
  font-family: var(--font-family-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-500);
}

.markdown {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  overflow-wrap: anywhere;
}

.markdown :is(ul, ol) {
  padding-inline-start: var(--space-6);
}

.markdown blockquote {
  border-inline-start: 3px solid var(--accent);
  padding-inline-start: var(--space-3);
  color: var(--ink-700);
}

.markdown code {
  background: var(--surface-muted);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
  font-size: var(--text-sm);
}

.thinking {
  font-size: var(--text-sm);
  color: var(--ink-500);
  font-style: italic;
}

@media (prefers-reduced-motion: no-preference) {
  .thinking {
    animation: pulse 1.6s ease-in-out infinite;
  }
}

@keyframes pulse {
  50% {
    opacity: 0.45;
  }
}
```

- [ ] **Step 4: Verificar que el test pasa**

Run: `cd frontend && pnpm test:unit run src/components/chat/MessageBubble`
Expected: PASS (4 tests).

- [ ] **Step 5: ChatPanel consume la primitiva**

En `frontend/src/components/chat/ChatPanel/ChatPanel.tsx`:

(a) Agregar el import (y borrar los que quedan sin uso al final del paso):

```tsx
import { MessageBubble } from "@/components/chat/MessageBubble";
```

(b) Reemplazar el bloque del map de mensajes (el `<article … >…</article>` completo dentro de `messages.map`) por:

```tsx
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            role={message.role}
            content={message.content}
            showThinking={isStreaming && message.content.length === 0}
          />
        ))}
```

(c) Borrar los imports que quedaron sin uso: `ReactMarkdown`, `remarkGfm`. **Ojo:** `BrandMark` sigue usándose en el hero — no borrarlo.

(d) En `ChatPanel.module.css`, **eliminar** los bloques movidos: `.userMessage`, `.assistantMessage`, `.assistantHeader`, `.assistantAvatar`, `.assistantName`, `.markdown` (y sus tres reglas descendientes `:is(ul, ol)`, `blockquote`, `code`), `.thinking`, la regla `.thinking { animation: … }` dentro del `@media (prefers-reduced-motion: no-preference)` (el media query se conserva porque adentro quedan las reglas de `.hero > *`), y `@keyframes pulse`. Todo lo demás queda igual.

- [ ] **Step 6: Gates**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit run`
Expected: todo verde (56 tests: 52 previos + 4 nuevos).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/MessageBubble frontend/src/components/chat/ChatPanel
git commit -m "refactor(frontend): extraer MessageBubble como primitiva compartida del chat"
```

---

### Task 2: Extraer `Composer` como primitiva compartida

**Files:**
- Create: `frontend/src/components/chat/Composer/Composer.tsx`
- Create: `frontend/src/components/chat/Composer/Composer.module.css`
- Create: `frontend/src/components/chat/Composer/index.ts`
- Create: `frontend/src/components/chat/Composer/Composer.test.tsx`
- Modify: `frontend/src/components/chat/ChatPanel/ChatPanel.tsx`
- Modify: `frontend/src/components/chat/ChatPanel/ChatPanel.module.css`

**Interfaces:**
- Produces: `Composer` con props `{ value: string; onChange: (value: string) => void; onSubmit: () => void; isStreaming: boolean; onStop?: () => void; placeholder: string; label: string; inputId: string; maxLength?: number; inputRef?: React.Ref<HTMLTextAreaElement>; className?: string }`. El padre valida antes de enviar (vacío/streaming) — `onSubmit` solo se dispara. Sin `onStop`, durante streaming el botón de enviar queda deshabilitado (comportamiento de la pantalla de revisión). Task 6 lo importa desde `@/components/chat/Composer`.

- [ ] **Step 1: Escribir el test que falla**

Crear `frontend/src/components/chat/Composer/Composer.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && pnpm test:unit run src/components/chat/Composer`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar el componente**

Crear `frontend/src/components/chat/Composer/Composer.tsx`:

```tsx
"use client";

import styles from "./Composer.module.css";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** El padre valida (vacío, streaming) — acá solo se dispara. */
  onSubmit: () => void;
  isStreaming: boolean;
  /** Sin onStop, durante el streaming el botón de enviar queda deshabilitado. */
  onStop?: () => void;
  placeholder: string;
  label: string;
  inputId: string;
  maxLength?: number;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  className?: string;
}

/**
 * Composer del chat — presentación pura compartida por el chat real
 * (ChatPanel) y el de revisión (SesionView). Enter envía; Shift+Enter hace
 * salto de línea.
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  isStreaming,
  onStop,
  placeholder,
  label,
  inputId,
  maxLength,
  inputRef,
  className,
}: ComposerProps) {
  return (
    <form
      className={className ? `${styles.composer} ${className}` : styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={inputId} className={styles.srOnly}>
        {label}
      </label>
      <textarea
        ref={inputRef}
        id={inputId}
        className={styles.input}
        value={value}
        maxLength={maxLength}
        rows={2}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {isStreaming && onStop ? (
        <button type="button" className={styles.stopButton} onClick={onStop} aria-label="Detener la respuesta">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" rx="2" />
          </svg>
        </button>
      ) : (
        <button
          type="submit"
          className={styles.sendButton}
          disabled={!value.trim() || isStreaming}
          aria-label="Enviar la consulta"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M2 18l16-8L2 2v6l11 2-11 2v6z" />
          </svg>
        </button>
      )}
    </form>
  );
}
```

Crear `frontend/src/components/chat/Composer/index.ts`:

```ts
export { Composer } from "./Composer";
```

Crear `frontend/src/components/chat/Composer/Composer.module.css` (clases movidas tal cual de `ChatPanel.module.css`):

```css
.composer {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-lg);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  box-shadow: var(--shadow-soft);
  transition: border-color 0.15s ease;
}

.composer:focus-within {
  border-color: var(--accent);
  box-shadow:
    var(--shadow-soft),
    0 0 0 4px var(--accent-soft);
}

.input {
  flex: 1;
  resize: none;
  border: none;
  background: transparent;
  font-family: var(--font-family-base);
  font-size: var(--text-base);
  line-height: var(--line-height-base);
  color: var(--ink-900);
  padding: var(--space-2) 0;
  min-height: 44px;
}

.input::placeholder {
  color: var(--ink-300);
}

.input:focus-visible {
  outline: none; /* el foco se marca en el borde del composer */
}

.sendButton,
.stopButton {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.1s ease;
}

.sendButton:active:not(:disabled),
.stopButton:active {
  transform: scale(0.95);
}

.sendButton {
  color: var(--surface);
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
}

.sendButton:hover:not(:disabled) {
  background: var(--accent-strong);
}

.sendButton:disabled {
  background: var(--ink-100);
  color: var(--ink-300);
  cursor: not-allowed;
}

.stopButton {
  color: var(--surface);
  background: var(--ink-900);
}

.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Verificar que el test pasa**

Run: `cd frontend && pnpm test:unit run src/components/chat/Composer`
Expected: PASS (4 tests).

- [ ] **Step 5: ChatPanel consume la primitiva**

En `frontend/src/components/chat/ChatPanel/ChatPanel.tsx`:

(a) Agregar import:

```tsx
import { Composer } from "@/components/chat/Composer";
```

(b) Reemplazar `handleSubmit` y la const `composer` (líneas del `const handleSubmit = …` hasta el cierre del JSX `)` de `composer`) por:

```tsx
  const enviar = () => {
    if (isStreaming || isResetting || !draft.trim()) return;
    void sendMessage(draft);
    setDraft("");
  };

  const composer = (heroStyle = false) => (
    <Composer
      value={draft}
      onChange={setDraft}
      onSubmit={enviar}
      isStreaming={isStreaming}
      onStop={stop}
      placeholder="Escribí tu consulta…"
      label="Escribí tu consulta"
      inputId="chat-input"
      maxLength={MAX_MESSAGE_LENGTH}
      inputRef={inputRef}
      className={heroStyle ? styles.heroComposer : undefined}
    />
  );
```

(c) Donde el JSX usaba `{composer}` dentro del hero, ahora va `{composer(true)}`; en la vista de conversación, `{composer()}`.

(d) En `ChatPanel.module.css`: **eliminar** los bloques movidos (`.composer`, `.composer:focus-within`, `.input`, `.input::placeholder`, `.input:focus-visible`, `.sendButton, .stopButton`, `.sendButton:active…`, `.sendButton`, `.sendButton:hover…`, `.sendButton:disabled`, `.stopButton`, `.srOnly`) y **reemplazar** la regla `.hero .composer { margin-top: var(--space-4); }` por:

```css
.heroComposer {
  margin-top: var(--space-4);
}
```

- [ ] **Step 6: Gates**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit run`
Expected: todo verde (60 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/Composer frontend/src/components/chat/ChatPanel
git commit -m "refactor(frontend): extraer Composer como primitiva compartida del chat"
```

---

### Task 3: Helper puro `citaDesdeSeleccion`

**Files:**
- Create: `frontend/src/lib/revision/seleccion.ts`
- Test: `frontend/src/lib/revision/seleccion.test.ts`

**Interfaces:**
- Produces: `citaDesdeSeleccion(seleccion: SeleccionComoTexto, contenedor: Element): { messageId: string; cita: string } | null` y el tipo `SeleccionComoTexto` (`{ isCollapsed: boolean; anchorNode: Node | null; focusNode: Node | null; toString(): string }` — subconjunto estructural de `Selection`, así el test no necesita una `Selection` real). Task 6 lo llama con `window.getSelection()`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `frontend/src/lib/revision/seleccion.test.ts`:

```ts
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
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && pnpm test:unit run src/lib/revision/seleccion`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

Crear `frontend/src/lib/revision/seleccion.ts` (client-safe — SIN `import "server-only"`, a diferencia de sus vecinos de `lib/revision/`):

```ts
/** Subconjunto estructural de Selection — permite testear sin Selection real. */
export interface SeleccionComoTexto {
  isCollapsed: boolean;
  anchorNode: Node | null;
  focusNode: Node | null;
  toString(): string;
}

/** Límite de crearNotaSchema (citaTexto máx. 2000). */
const MAX_CITA = 2000;

function mensajeDe(node: Node | null): HTMLElement | null {
  const elemento = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  return elemento?.closest<HTMLElement>("[data-message-id]") ?? null;
}

/**
 * Traduce la selección del experto a un anclaje de nota: válida solo si cae
 * completa dentro de UN mensaje (elemento con data-message-id) del contenedor.
 * La cita es el texto seleccionado, recortado al límite que valida el endpoint.
 */
export function citaDesdeSeleccion(
  seleccion: SeleccionComoTexto,
  contenedor: Element,
): { messageId: string; cita: string } | null {
  if (seleccion.isCollapsed) return null;
  const inicio = mensajeDe(seleccion.anchorNode);
  const fin = mensajeDe(seleccion.focusNode);
  if (!inicio || inicio !== fin) return null;
  if (!contenedor.contains(inicio)) return null;
  const cita = seleccion.toString().trim().slice(0, MAX_CITA);
  if (!cita) return null;
  const messageId = inicio.dataset.messageId;
  if (!messageId) return null;
  return { messageId, cita };
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `cd frontend && pnpm test:unit run src/lib/revision/seleccion`
Expected: PASS (5 tests).

- [ ] **Step 5: Gates y commit**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit run`
Expected: verde (65 tests).

```bash
git add frontend/src/lib/revision/seleccion.ts frontend/src/lib/revision/seleccion.test.ts
git commit -m "feat(frontend): helper citaDesdeSeleccion para anclaje de notas por selección"
```

---

### Task 4: Shell navy y design system en `/revision`

**Files:**
- Rewrite: `frontend/src/components/revision/revision.module.css` (archivo completo nuevo)
- Modify: `frontend/src/app/revision/page.tsx`

**Interfaces:**
- Consumes: tokens de `globals.css`; `BrandMark`.
- Produces: TODAS las clases CSS que consumen las Tasks 5 y 6 (`nota`, `notaAbierta`, `notaRespondida`, `notaResueltaCard`, `notaHeader`, `notaAutor`, `notaFecha`, `chipAbierta`, `chipRespondida`, `chipResuelta`, `notaCita`, `notaTexto`, `respuestas`, `respuesta`, `respuestaDev`, `respuestaExperto`, `respuestaMeta`, `notaPie`, `responderPlaceholder`, `formNota`, `formNotaCard`, `filaBotones`, `notaResuelta`, `linkSutil`, `notasGenerales`, `seccionTitulo`, `sesionHeader`, `sesionMeta`, `sesionAcciones`, `chatColumna`, `bloqueMensaje`, `mensajeConGutter`, `botonAnotar`, `pillSeleccion`) además de las que ya usan `AccesoForm`/`ListadoSesiones` (mismos nombres actuales — esos dos componentes NO se tocan).

**Nota de transición:** al reescribir el CSS, `SesionView.tsx` y `NotaThread.tsx` viejos referencian clases que ya no existen — la vista de sesión queda transitoriamente sin estilos (sin crash: `styles.x` undefined ⇒ sin clase). Se corrige en las Tasks 5-6; los gates de esta task son typecheck/lint/unit, no visuales.

- [ ] **Step 1: Reescribir `revision.module.css` completo**

Reemplazar TODO el contenido de `frontend/src/components/revision/revision.module.css` por:

```css
/* Design system de /revision — mismo lenguaje visual que el chat real (tokens
   de globals.css). Las burbujas y el composer del chat NO viven acá: son las
   primitivas compartidas MessageBubble/Composer. */

/* --- Shell (header navy del home + lavado celeste) --- */

.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  background: var(--navy);
  color: var(--on-navy);
  border-bottom: 1px solid color-mix(in srgb, var(--on-navy) 10%, transparent);
}

.wordmark {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-family-display);
  font-size: var(--text-lg);
  font-weight: 600;
  letter-spacing: var(--tracking-display);
  text-transform: uppercase;
  color: var(--on-navy);
}

.chipRevision {
  font-family: var(--font-family-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--on-navy-muted);
  border: 1px solid color-mix(in srgb, var(--on-navy) 25%, transparent);
  border-radius: 999px;
  padding: 2px 10px;
}

.main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-6) var(--space-4) var(--space-8);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 60%);
}

.columna {
  width: 100%;
  max-width: 46rem; /* misma métrica que .panel del chat real */
}

/* --- Tipografía compartida de las vistas --- */

.titulo {
  font-family: var(--font-family-serif);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--navy);
}

.subtitulo {
  color: var(--ink-500);
  font-size: var(--text-sm);
}

.error {
  margin: var(--space-2) 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--state-error) 8%, var(--surface));
  color: var(--state-error);
  font-size: var(--text-sm);
}

/* --- Botones --- */

.botonPrimario {
  padding: var(--space-2) var(--space-4);
  border: none;
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  color: var(--surface);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.1s ease;
}

.botonPrimario:hover:not(:disabled) {
  background: var(--accent-strong);
}

.botonPrimario:active:not(:disabled) {
  transform: scale(0.98);
}

.botonPrimario:disabled {
  background: var(--ink-100);
  color: var(--ink-300);
  cursor: not-allowed;
}

.botonSecundario {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink-700);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.botonSecundario:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--navy);
}

/* --- Acceso --- */

.formAcceso {
  display: grid;
  gap: var(--space-3);
  width: 100%;
  max-width: 400px;
  margin: var(--space-8) auto;
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  padding: var(--space-6);
}

.campo {
  display: grid;
  gap: var(--space-1);
}

.campo label {
  font-family: var(--font-family-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-700);
}

.campo input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  font: inherit;
  background: var(--surface);
}

.campo input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

/* --- Listado de sesiones --- */

.encabezado {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.filaNueva {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.filaNueva input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  font: inherit;
  background: var(--surface);
}

.filaNueva input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.listado {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-3);
}

.tarjetaSesion {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.tarjetaSesion:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: var(--shadow-raised);
}

.tarjetaMeta {
  color: var(--ink-500);
  font-size: var(--text-xs);
}

.badges {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}

.badgeAbierta {
  background: color-mix(in srgb, var(--state-warning) 14%, var(--surface));
  color: var(--state-warning);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--text-xs);
  font-weight: 600;
}

.badgeRespondida {
  background: var(--accent-soft);
  color: var(--accent-strong);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--text-xs);
  font-weight: 600;
}

/* --- Sesión: header --- */

.sesionHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.sesionMeta {
  color: var(--ink-500);
  font-size: var(--text-sm);
}

.sesionAcciones {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* --- Sesión: chat anotable --- */

.chatColumna {
  position: relative; /* marco de posicionamiento del pill de selección */
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-1) var(--space-6);
}

.bloqueMensaje {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.mensajeConGutter {
  position: relative;
  display: flex;
  flex-direction: column; /* el align-self de la burbuja aplica acá adentro */
}

/* El "+" del gutter estilo GitHub: aparece al hover del mensaje. */
.botonAnotar {
  position: absolute;
  top: -10px;
  inset-inline-end: -6px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--accent), var(--accent-strong));
  color: var(--surface);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: var(--shadow-soft);
  opacity: 0;
  transform: scale(0.85);
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.mensajeConGutter:hover .botonAnotar,
.botonAnotar:focus-visible {
  opacity: 1;
  transform: scale(1);
}

.pillSeleccion {
  position: absolute;
  z-index: 10;
  transform: translateX(-50%);
  padding: var(--space-1) var(--space-3);
  border: none;
  border-radius: 999px;
  background: var(--navy);
  color: var(--on-navy);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow-raised);
}

/* --- Notas: tarjetas de hilo (estilo GitHub) --- */

.nota {
  background: var(--surface);
  border: 1px solid var(--ink-100);
  border-inline-start: 3px solid var(--ink-300);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
  padding: var(--space-3) var(--space-4);
  display: grid;
  gap: var(--space-2);
  max-width: 95%;
}

.notaAbierta {
  border-inline-start-color: var(--state-warning);
}

.notaRespondida {
  border-inline-start-color: var(--accent);
}

.notaResueltaCard {
  border-inline-start-color: var(--state-success);
}

.notaHeader {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.notaAutor {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--ink-900);
}

.notaFecha {
  color: var(--ink-500);
  font-size: var(--text-xs);
}

.chipAbierta {
  margin-inline-start: auto;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--text-xs);
  font-weight: 600;
  background: color-mix(in srgb, var(--state-warning) 14%, var(--surface));
  color: var(--state-warning);
}

.chipRespondida {
  margin-inline-start: auto;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--text-xs);
  font-weight: 600;
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.chipResuelta {
  margin-inline-start: auto;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--text-xs);
  font-weight: 600;
  background: color-mix(in srgb, var(--state-success) 12%, var(--surface));
  color: var(--state-success);
}

.notaCita {
  background: var(--surface-muted);
  border-inline-start: 3px solid var(--ink-300);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  color: var(--ink-700);
  font-size: var(--text-sm);
  font-style: italic;
  overflow-wrap: anywhere;
}

.notaTexto {
  overflow-wrap: anywhere;
}

.respuestas {
  display: grid;
  gap: var(--space-2);
  border-inline-start: 2px solid var(--ink-100);
  padding-inline-start: var(--space-3);
}

.respuesta {
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
}

.respuestaDev {
  background: var(--accent-soft);
}

.respuestaExperto {
  background: var(--surface-muted);
}

.respuestaMeta {
  font-size: var(--text-xs);
  color: var(--ink-500);
  margin-bottom: 2px;
}

.notaPie {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.responderPlaceholder {
  flex: 1;
  text-align: start;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--ink-100);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-300);
  font: inherit;
  font-size: var(--text-sm);
  cursor: text;
}

.formNota {
  display: grid;
  gap: var(--space-2);
}

.formNota textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  font: inherit;
  min-height: 64px;
  resize: vertical;
  background: var(--surface);
}

.formNota textarea:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

/* Composer de nota nueva: borde accent = edición activa. */
.formNotaCard {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
  padding: var(--space-3) var(--space-4);
  display: grid;
  gap: var(--space-2);
  max-width: 95%;
}

.filaBotones {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

/* Hilo resuelto colapsado: una línea expandible, como GitHub. */
.notaResuelta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: fit-content;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--ink-100);
  border-radius: 999px;
  background: var(--surface);
  color: var(--state-success);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.notaResuelta:hover {
  border-color: var(--state-success);
}

.linkSutil {
  border: none;
  background: none;
  color: var(--ink-500);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
  text-decoration: underline;
  justify-self: start;
  padding: 0;
}

/* --- Notas generales --- */

.notasGenerales {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.seccionTitulo {
  font-family: var(--font-family-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-500);
}

@media (max-width: 540px) {
  .sesionHeader {
    flex-direction: column;
  }

  .encabezado {
    flex-direction: column;
    gap: var(--space-1);
  }
}
```

- [ ] **Step 2: Shell en `page.tsx`**

En `frontend/src/app/revision/page.tsx`: agregar el import de `BrandMark` y reemplazar el `return` completo del componente por:

```tsx
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.wordmark}>
          <BrandMark size={22} />
          Jurco
        </span>
        <span className={styles.chipRevision}>Revisión</span>
      </header>
      <main className={styles.main}>
        <div className={styles.columna}>
          {vista.tipo === "acceso" ? (
            <AccesoForm onAcceso={() => void cargarListado()} />
          ) : vista.tipo === "listado" ? (
            <>
              <header className={styles.encabezado}>
                <h1 className={styles.titulo}>Sesiones de revisión</h1>
                <p className={styles.subtitulo}>Espacio compartido del equipo legal</p>
              </header>
              {error ? <p role="alert" className={styles.error}>{error}</p> : null}
              <ListadoSesiones sesiones={sesiones} onAbrir={(id) => setVista({ tipo: "sesion", id })} onCrear={crearSesion} />
            </>
          ) : vista.tipo === "sesion" ? (
            <SesionView id={vista.id} onVolver={() => void cargarListado()} />
          ) : null}
        </div>
      </main>
    </div>
  );
```

Import a agregar arriba: `import { BrandMark } from "@/components/brand/BrandMark";`

`AccesoForm` y `ListadoSesiones` NO se tocan: sus clases conservan el nombre y reciben el restyle vía CSS.

- [ ] **Step 3: Gates**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit run`
Expected: verde (los tests de rutas de revisión no dependen del CSS).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/revision/revision.module.css frontend/src/app/revision/page.tsx
git commit -m "style(frontend): shell navy y design system en las pantallas de revisión"
```

---

### Task 5: `NotaComposer` + `NotaThread` estilo GitHub

**Files:**
- Create: `frontend/src/components/revision/NotaComposer.tsx`
- Rewrite: `frontend/src/components/revision/NotaThread.tsx`
- Create: `frontend/src/components/revision/NotaThread.test.tsx`
- Modify: `frontend/src/components/revision/SesionView.tsx` (solo parche de compatibilidad de tipos — la reescritura completa es Task 6)

**Interfaces:**
- Consumes: clases CSS de Task 4; tipo `NotaConRespuestas` (import type-only de `@/lib/revision/notas` — se borra en compile, no dispara `server-only`).
- Produces:
  - `NotaComposer` props `{ cita: string | null; onCancelar: () => void; onGuardar: (texto: string) => Promise<boolean> }` — `onGuardar` devuelve `false` ⇒ muestra error inline; `true` ⇒ el padre cierra el composer.
  - `NotaThread` props `{ nota: NotaConRespuestas; onResponder: (notaId: string, texto: string) => Promise<boolean>; onResolver: (notaId: string) => Promise<boolean> }` — **cambio de contrato**: los callbacks ahora devuelven `Promise<boolean>` (éxito) en vez de `Promise<void>`. Task 6 provee las implementaciones.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `frontend/src/components/revision/NotaThread.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Verificar que falla**

Run: `cd frontend && pnpm test:unit run src/components/revision/NotaThread`
Expected: FAIL — el `NotaThread` actual no tiene "Responder…" ni colapso, y sus props tienen otro contrato.

- [ ] **Step 3: Implementar `NotaComposer`**

Crear `frontend/src/components/revision/NotaComposer.tsx`:

```tsx
"use client";

import { useState } from "react";

import styles from "./revision.module.css";

interface NotaComposerProps {
  /** Pasaje seleccionado que la nota cita; null en nota de mensaje entero o general. */
  cita: string | null;
  onCancelar: () => void;
  /** Devuelve true si se guardó (el padre cierra el composer); false muestra error acá. */
  onGuardar: (texto: string) => Promise<boolean>;
}

export function NotaComposer({ cita, onCancelar, onGuardar }: NotaComposerProps) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    const ok = await onGuardar(texto.trim());
    setEnviando(false);
    if (!ok) setError("No pudimos guardar la nota. Intentá de nuevo.");
  };

  return (
    <div className={styles.formNotaCard}>
      {cita ? <blockquote className={styles.notaCita}>{cita}</blockquote> : null}
      <div className={styles.formNota}>
        <textarea
          value={texto}
          placeholder="¿Qué observaste en esta respuesta?"
          onChange={(event) => setTexto(event.target.value)}
          aria-label="Texto de la nota"
        />
        {error ? <p role="alert" className={styles.error}>{error}</p> : null}
        <div className={styles.filaBotones}>
          <button type="button" className={styles.botonSecundario} onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.botonPrimario}
            disabled={enviando || !texto.trim()}
            onClick={() => void guardar()}
          >
            Guardar nota
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Reescribir `NotaThread`**

Reemplazar TODO el contenido de `frontend/src/components/revision/NotaThread.tsx` por:

```tsx
"use client";

import { useState } from "react";

import type { NotaConRespuestas } from "@/lib/revision/notas";

import styles from "./revision.module.css";

const CHIP: Record<NotaConRespuestas["estado"], { label: string; clase: string; title: string }> = {
  ABIERTA: { label: "Abierta", clase: styles.chipAbierta, title: "Esperando al equipo de desarrollo" },
  RESPONDIDA: { label: "Respondida", clase: styles.chipRespondida, title: "Esperando tu revisión" },
  RESUELTA: { label: "Resuelta", clase: styles.chipResuelta, title: "Cerrada" },
};

const BORDE: Record<NotaConRespuestas["estado"], string> = {
  ABIERTA: styles.notaAbierta,
  RESPONDIDA: styles.notaRespondida,
  RESUELTA: styles.notaResueltaCard,
};

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Hilo de nota estilo code review de GitHub: tarjeta con estado, cita del
 * pasaje, respuestas anidadas, responder expandible y resolver. Los hilos
 * resueltos colapsan a una línea expandible.
 */
export function NotaThread({
  nota,
  onResponder,
  onResolver,
}: {
  nota: NotaConRespuestas;
  onResponder: (notaId: string, texto: string) => Promise<boolean>;
  onResolver: (notaId: string) => Promise<boolean>;
}) {
  const [respuesta, setRespuesta] = useState("");
  const [respondiendo, setRespondiendo] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (nota.estado === "RESUELTA" && !expandida) {
    const cuenta = nota.respuestas.length === 1 ? "1 respuesta" : `${String(nota.respuestas.length)} respuestas`;
    return (
      <button type="button" className={styles.notaResuelta} onClick={() => setExpandida(true)}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 8.5l3.5 3.5L13 4.5" />
        </svg>
        Resuelta · {cuenta} · {nota.autor}
      </button>
    );
  }

  const responder = async () => {
    if (!respuesta.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    const ok = await onResponder(nota.id, respuesta.trim());
    setEnviando(false);
    if (ok) {
      setRespuesta("");
      setRespondiendo(false);
    } else {
      setError("No pudimos enviar la respuesta. Intentá de nuevo.");
    }
  };

  const resolver = async () => {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    const ok = await onResolver(nota.id);
    setEnviando(false);
    if (!ok) setError("No pudimos resolver la nota. Intentá de nuevo.");
  };

  const chip = CHIP[nota.estado];

  return (
    <div className={`${styles.nota} ${BORDE[nota.estado]}`}>
      <div className={styles.notaHeader}>
        <span className={styles.notaAutor}>{nota.autor}</span>
        <span className={styles.notaFecha}>{fechaCorta(nota.createdAt)}</span>
        <span className={chip.clase} title={chip.title}>
          {chip.label}
        </span>
      </div>
      {nota.citaTexto ? <blockquote className={styles.notaCita}>{nota.citaTexto}</blockquote> : null}
      <p className={styles.notaTexto}>{nota.texto}</p>
      {nota.respuestas.length > 0 ? (
        <div className={styles.respuestas}>
          {nota.respuestas.map((r) => (
            <div key={r.id} className={`${styles.respuesta} ${r.origen === "DEV" ? styles.respuestaDev : styles.respuestaExperto}`}>
              <p className={styles.respuestaMeta}>
                {r.autor} · {fechaCorta(r.createdAt)}
              </p>
              <p>{r.texto}</p>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {nota.estado === "RESUELTA" ? (
        <button type="button" className={styles.linkSutil} onClick={() => setExpandida(false)}>
          Ocultar
        </button>
      ) : respondiendo ? (
        <div className={styles.formNota}>
          <textarea
            value={respuesta}
            placeholder="Responder…"
            onChange={(event) => setRespuesta(event.target.value)}
            aria-label="Responder la nota"
          />
          <div className={styles.filaBotones}>
            <button
              type="button"
              className={styles.botonSecundario}
              onClick={() => {
                setRespondiendo(false);
                setRespuesta("");
                setError(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={styles.botonPrimario}
              disabled={enviando || !respuesta.trim()}
              onClick={() => void responder()}
            >
              Responder
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.notaPie}>
          <button type="button" className={styles.responderPlaceholder} onClick={() => setRespondiendo(true)}>
            Responder…
          </button>
          <button type="button" className={styles.botonSecundario} disabled={enviando} onClick={() => void resolver()}>
            Resolver
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Parche de compatibilidad en el `SesionView` actual**

El nuevo contrato (`Promise<boolean>`) rompería el typecheck del `SesionView` viejo. Para que ESTE commit quede verde, en `frontend/src/components/revision/SesionView.tsx` reemplazar las funciones `responderNota` y `resolverNota` actuales por versiones que devuelven boolean (misma lógica, retorno explícito):

```tsx
  const responderNota = async (notaId: string, texto: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}/respuestas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    }).catch(() => null);
    if (!response?.ok) return false;
    await refetch();
    return true;
  };

  const resolverNota = async (notaId: string): Promise<boolean> => {
    const response = await fetch(`/api/revision/notas/${notaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "RESUELTA" }),
    }).catch(() => null);
    if (!response?.ok) return false;
    await refetch();
    return true;
  };
```

(El resto del `SesionView` viejo no se toca acá; Task 6 lo reescribe entero.)

- [ ] **Step 6: Verificar que los tests y gates pasan**

Run: `cd frontend && pnpm test:unit run src/components/revision/NotaThread`
Expected: PASS (4 tests).

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit run`
Expected: TODO verde (69 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/revision/NotaComposer.tsx frontend/src/components/revision/NotaThread.tsx frontend/src/components/revision/NotaThread.test.tsx frontend/src/components/revision/SesionView.tsx
git commit -m "feat(frontend): tarjetas de nota estilo GitHub (NotaThread + NotaComposer)"
```

---

### Task 6: Reescribir `SesionView` — chat con primitivas + notas inline

**Files:**
- Rewrite: `frontend/src/components/revision/SesionView.tsx`

**Interfaces:**
- Consumes: `MessageBubble` (Task 1, con `anchorId`), `Composer` (Task 2), `citaDesdeSeleccion` (Task 3), clases CSS (Task 4), `NotaThread`/`NotaComposer` (Task 5), `useRevisionChat` (sin cambios).
- Produces: la vista final de sesión. Mantiene la prop pública `{ id: string; onVolver: () => void }` (sin cambios para `page.tsx`).

- [ ] **Step 1: Reescribir el componente**

Reemplazar TODO el contenido de `frontend/src/components/revision/SesionView.tsx` por:

```tsx
"use client";

import { useRef, useState } from "react";

import { Composer } from "@/components/chat/Composer";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useRevisionChat } from "@/hooks/useRevisionChat";
import type { NotaConRespuestas } from "@/lib/revision/notas";
import { citaDesdeSeleccion } from "@/lib/revision/seleccion";

import { NotaComposer } from "./NotaComposer";
import { NotaThread } from "./NotaThread";
import styles from "./revision.module.css";

const MAX_MESSAGE_LENGTH = 4000;

interface ComposerAbierto {
  messageId: string | null;
  cita: string | null;
}

interface PillSeleccion {
  messageId: string;
  cita: string;
  x: number;
  y: number;
}

export function SesionView({ id, onVolver }: { id: string; onVolver: () => void }) {
  const { detalle, isStreaming, pendienteUsuario, textoStreaming, error, sendMessage, refetch } = useRevisionChat(id);
  const [draft, setDraft] = useState("");
  const [composerAbierto, setComposerAbierto] = useState<ComposerAbierto | null>(null);
  const [pill, setPill] = useState<PillSeleccion | null>(null);
  const chatRef = useRef<HTMLElement>(null);

  const enviar = () => {
    if (isStreaming || !draft.trim()) return;
    void sendMessage(draft);
    setDraft("");
  };

  const abrirComposer = (messageId: string | null, cita: string | null) => {
    setComposerAbierto({ messageId, cita });
    setPill(null);
  };

  // Pill "Dejar nota" al soltar una selección contenida en un solo mensaje.
  const handleMouseUp = () => {
    const seleccion = window.getSelection();
    const contenedor = chatRef.current;
    if (!seleccion || seleccion.rangeCount === 0 || !contenedor) {
      setPill(null);
      return;
    }
    const ancla = citaDesdeSeleccion(seleccion, contenedor);
    if (!ancla) {
      setPill(null);
      return;
    }
    const rect = seleccion.getRangeAt(0).getBoundingClientRect();
    const marco = contenedor.getBoundingClientRect();
    setPill({ ...ancla, x: rect.left - marco.left + rect.width / 2, y: rect.bottom - marco.top + 6 });
  };

  const crearNota = async (texto: string): Promise<boolean> => {
    if (!composerAbierto) return false;
    try {
      const response = await fetch(`/api/revision/sesiones/${id}/notas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          ...(composerAbierto.messageId ? { messageId: composerAbierto.messageId } : {}),
          ...(composerAbierto.cita ? { citaTexto: composerAbierto.cita.slice(0, 2000) } : {}),
        }),
      });
      if (!response.ok) return false;
      setComposerAbierto(null);
      await refetch();
      return true;
    } catch {
      return false;
    }
  };

  const responderNota = async (notaId: string, texto: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/revision/notas/${notaId}/respuestas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!response.ok) return false;
      await refetch();
      return true;
    } catch {
      return false;
    }
  };

  const resolverNota = async (notaId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/revision/notas/${notaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "RESUELTA" }),
      });
      if (!response.ok) return false;
      await refetch();
      return true;
    } catch {
      return false;
    }
  };

  const mensajes = (detalle?.timeline ?? []).filter((item) => item.tipo === "mensaje");
  const notas = detalle?.notas ?? [];
  const notasDeMensaje = (messageId: string): NotaConRespuestas[] => notas.filter((nota) => nota.messageId === messageId);
  const notasGenerales = notas.filter((nota) => nota.messageId === null);
  const composerGeneralAbierto = composerAbierto !== null && composerAbierto.messageId === null;

  return (
    <div>
      <header className={styles.sesionHeader}>
        <div>
          <h1 className={styles.titulo}>{detalle?.sesion.titulo ?? "Sesión de revisión"}</h1>
          <p className={styles.sesionMeta}>Creada por {detalle?.sesion.creadaPor ?? "—"}</p>
        </div>
        <div className={styles.sesionAcciones}>
          <button type="button" className={styles.botonSecundario} onClick={() => abrirComposer(null, null)}>
            Nota general
          </button>
          <button type="button" className={styles.botonSecundario} onClick={onVolver}>
            Volver al listado
          </button>
        </div>
      </header>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}

      {notasGenerales.length > 0 || composerGeneralAbierto ? (
        <section className={styles.notasGenerales} aria-label="Notas generales">
          <h2 className={styles.seccionTitulo}>Notas generales</h2>
          {notasGenerales.map((nota) => (
            <NotaThread key={nota.id} nota={nota} onResponder={responderNota} onResolver={resolverNota} />
          ))}
          {composerGeneralAbierto ? (
            <NotaComposer cita={null} onCancelar={() => setComposerAbierto(null)} onGuardar={crearNota} />
          ) : null}
        </section>
      ) : null}

      <section aria-label="Conversación de prueba" className={styles.chatColumna} ref={chatRef} onMouseUp={handleMouseUp}>
        {mensajes.map((mensaje) => (
          <div key={mensaje.id} className={styles.bloqueMensaje}>
            <div className={styles.mensajeConGutter}>
              <MessageBubble role={mensaje.rol} content={mensaje.texto} anchorId={mensaje.id} />
              <button
                type="button"
                className={styles.botonAnotar}
                onClick={() => abrirComposer(mensaje.id, null)}
                aria-label="Dejar nota en este mensaje"
              >
                +
              </button>
            </div>
            {notasDeMensaje(mensaje.id).map((nota) => (
              <NotaThread key={nota.id} nota={nota} onResponder={responderNota} onResolver={resolverNota} />
            ))}
            {composerAbierto?.messageId === mensaje.id ? (
              <NotaComposer
                cita={composerAbierto.cita}
                onCancelar={() => setComposerAbierto(null)}
                onGuardar={crearNota}
              />
            ) : null}
          </div>
        ))}
        {pendienteUsuario ? <MessageBubble role="user" content={pendienteUsuario} /> : null}
        {textoStreaming !== null ? (
          <MessageBubble role="assistant" content={textoStreaming} showThinking={textoStreaming.length === 0} />
        ) : null}
        {pill ? (
          <button
            type="button"
            className={styles.pillSeleccion}
            style={{ left: pill.x, top: pill.y }}
            onClick={() => {
              abrirComposer(pill.messageId, pill.cita);
              window.getSelection()?.removeAllRanges();
            }}
          >
            Dejar nota
          </button>
        ) : null}
      </section>

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={enviar}
        isStreaming={isStreaming}
        placeholder="Probá al asistente como si fueras un consultante…"
        label="Mensaje de prueba"
        inputId="revision-input"
        maxLength={MAX_MESSAGE_LENGTH}
      />
    </div>
  );
}
```

- [ ] **Step 2: Gates completos**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit run`
Expected: TODO verde (69 tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/revision/SesionView.tsx
git commit -m "feat(frontend): chat de revisión con primitivas compartidas y notas inline"
```

---

### Task 7: E2E ajustado + verificación integral

**Files:**
- Modify: `frontend/tests/revision.spec.ts`

**Interfaces:**
- Consumes: labels/roles finales de Tasks 4-6 (`"Enviar la consulta"`, `"Respuesta del asistente"`, `"Dejar nota en este mensaje"`, `"Texto de la nota"`, `"Guardar nota"`, `"Responder…"`, `"Responder la nota"`, `"Responder"`, `"Resolver"`, chip `"Abierta"`, colapso `"Resuelta · 1 respuesta"`).

- [ ] **Step 1: Reescribir el e2e**

Reemplazar TODO el contenido de `frontend/tests/revision.spec.ts` por:

```ts
import { expect, test } from "@playwright/test";

const CLAVE = process.env.REVISION_CLAVE ?? "";

test.skip(!CLAVE, "REVISION_CLAVE no seteada — E2E de revisión deshabilitado");

test("ciclo de revisión: acceso → sesión → chat → nota inline → responder → resolver", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/revision");

  await page.getByLabel("Tu nombre").fill("Dra. E2E");
  await page.getByLabel("Clave de acceso").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { name: "Sesiones de revisión" })).toBeVisible();
  await page.getByLabel("Título de la nueva sesión").fill("E2E despido");
  await page.getByRole("button", { name: "Nueva sesión de revisión" }).click();

  await page.getByLabel("Mensaje de prueba").fill("Hola, me despidieron sin causa después de 6 años");
  await page.getByLabel("Enviar la consulta").click();

  // Tras el turno, el transcript persistido se recarga con messageId reales.
  const respuesta = page.getByLabel("Respuesta del asistente").last();
  await expect(respuesta).toBeVisible({ timeout: 90_000 });

  // Nota inline por mensaje: el "+" del gutter aparece al hover (GitHub-style).
  await respuesta.hover();
  await page.getByLabel("Dejar nota en este mensaje").last().click();
  await page.getByLabel("Texto de la nota").fill("Nota E2E: revisar esta respuesta");
  await page.getByRole("button", { name: "Guardar nota" }).click();

  await expect(page.getByText("Nota E2E: revisar esta respuesta")).toBeVisible();
  await expect(page.getByText("Abierta", { exact: true })).toBeVisible();

  // Responder el hilo y resolverlo — resuelto colapsa a una línea.
  await page.getByRole("button", { name: "Responder…" }).click();
  await page.getByLabel("Responder la nota").fill("Anotado, lo revisamos");
  await page.getByRole("button", { name: "Responder", exact: true }).click();
  await expect(page.getByText("Anotado, lo revisamos")).toBeVisible();
  await page.getByRole("button", { name: "Resolver" }).click();
  await expect(page.getByText(/Resuelta · 1 respuesta/)).toBeVisible();
});
```

- [ ] **Step 2: Preparar el entorno del e2e**

El e2e necesita: (a) el puerto 3000 libre — el dev server del checkout PRINCIPAL puede estar ocupándolo y `reuseExistingServer` haría que Playwright pruebe el código viejo; (b) el backend Mastra vivo en :4112 (no cambió en este plan — el del checkout principal sirve); (c) `REVISION_CLAVE` en `frontend/.env` (symlinkeado en Task 1; si falta, el e2e se auto-skipea y se deja constancia).

```bash
curl -s -o /dev/null -w "backend:%{http_code}\n" http://localhost:4112/dominios   # esperar 200
fuser -k 3000/tcp 2>/dev/null || true                                             # liberar :3000
grep -c "REVISION_CLAVE" frontend/.env || echo "SIN CLAVE — e2e se skipea"
```

- [ ] **Step 3: Correr el e2e**

Run: `cd frontend && pnpm test tests/revision.spec.ts`
Expected: PASS (1 test, chromium; Playwright levanta su propio dev server del worktree). Si `REVISION_CLAVE` falta: SKIP reportado — dejar constancia en el reporte de la task.

- [ ] **Step 4: Gates finales completos**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test:unit run`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/revision.spec.ts
git commit -m "test(frontend): e2e de revisión ajustado al chat anotable"
```

- [ ] **Step 6: Verificación visual (la ejecuta el controlador de la sesión, no un subagente)**

Con el dev server del worktree corriendo: capturar con Playwright MCP (1) el home `/` en estado vacío y en conversación — debe ser indistinguible del estado pre-refactor —, (2) `/revision`: acceso, listado, y sesión con nota por selección, hilo respondido y hilo resuelto colapsado. Cualquier diferencia visual en el home = defecto a corregir antes del merge.

---

## Notas para el ejecutor

- Las Tasks 1-3 son independientes entre sí; 4 → 5 → 6 → 7 son secuenciales (5 y 6 consumen el CSS de 4; 6 consume el contrato de 5; 7 verifica el conjunto).
- El contrato nuevo de callbacks es `Promise<boolean>` (éxito) — no "simplificarlo" de vuelta a `Promise<void>`: el boolean es lo que permite los errores inline del spec §3/§4.
- El módulo de revisión usa nombres en español (`NotaThread`, `crearNota`, `sesionHeader`) — es la convención preexistente del módulo; respetarla.
- No tocar: `useRevisionChat.ts`, `AccesoForm.tsx`, `ListadoSesiones.tsx`, `lib/revision/*` (salvo el nuevo `seleccion.ts`), rutas API, schema Prisma.
```
