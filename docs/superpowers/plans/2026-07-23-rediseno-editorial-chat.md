# Rediseño Editorial del Chat del Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplanar el chat del home hacia un look editorial claro y sobrio: header blanco con hairline, cero sombras/gradientes, mensajes tipográficos y composer plano.

**Architecture:** Cambios solo en CSS Modules del chat (4 archivos); ningún cambio de markup TSX ni de tokens en `globals.css`. Los nombres de clases CSS no se renombran porque los TSX los referencian vía `styles.*`.

**Tech Stack:** Next.js App Router, CSS Modules, tokens de diseño en `frontend/src/app/globals.css` (solo lectura).

**Spec:** `docs/superpowers/specs/2026-07-23-rediseno-editorial-chat-design.md`

## Global Constraints

- NO tocar `frontend/src/app/globals.css` (sus tokens los consume también `/revision`).
- NO renombrar clases CSS existentes ni tocar archivos `.tsx` — el cambio es 100% CSS.
- `MessageBubble` es compartido con `SesionView` (`/revision`): el restyle de mensajes alcanza ambas pantallas (decisión aceptada en el spec).
- Conventional commits en español (`feat(frontend): …`); lint + tests antes de commit.
- Regla de movimiento del spec: transiciones de color de 0.15s se quedan; todo lo que mueve píxeles (translateY, flecha deslizante, stagger, scale) se va. Excepciones: fade único del hero y pulso de "Buscando en el corpus…".
- Comandos del frontend se corren desde `/home/bryan/LegalSeller/frontend`: `pnpm lint` (eslint), `pnpm typecheck` (tsc), `pnpm test:unit run` (vitest one-shot).

---

### Task 1: Marco de página — header claro y fondo uniforme

**Files:**
- Modify: `frontend/src/app/page.module.css` (archivo completo abajo)

**Interfaces:**
- Consumes: tokens de `globals.css` (`--surface`, `--navy`, `--accent`, `--ink-100`, `--ink-500`, espaciados, tipografías).
- Produces: clases `shell`, `header`, `wordmark`, `main`, `footer` — mismos nombres que hoy, consumidos por `frontend/src/app/page.tsx` (no se toca).

**Qué cambia:** el header pasa de navy sólido a blanco con hairline inferior; el wordmark queda en tinta navy con la balanza (SVG `BrandMark`, hereda `currentColor`) en azul acero; se elimina el lavado celeste degradado de `.main`.

- [ ] **Step 1: Reemplazar el contenido completo de `frontend/src/app/page.module.css` por:**

```css
.shell {
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  background: var(--surface);
  color: var(--navy);
  border-bottom: 1px solid var(--ink-100);
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
  color: var(--navy);
}

/* La balanza (BrandMark) hereda currentColor: acento azul acero sobre header claro. */
.wordmark svg {
  color: var(--accent);
}

.main {
  flex: 1;
  min-height: 0;
  display: flex;
  justify-content: center;
  padding: 0 var(--space-4);
}

.footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  text-align: center;
  border-top: 1px solid var(--ink-100);
}

.footer p {
  font-size: var(--text-xs);
  color: var(--ink-500);
}
```

- [ ] **Step 2: Verificar lint y typecheck**

Run: `cd /home/bryan/LegalSeller/frontend && pnpm lint && pnpm typecheck`
Expected: ambos salen sin errores.

- [ ] **Step 3: Commit**

```bash
cd /home/bryan/LegalSeller
git add frontend/src/app/page.module.css
git commit -m "feat(frontend): header claro con hairline y fondo uniforme en el home"
```

---

### Task 2: Hero y sugerencias aplanadas

**Files:**
- Modify: `frontend/src/components/chat/ChatPanel/ChatPanel.module.css` (archivo completo abajo)

**Interfaces:**
- Consumes: tokens de `globals.css`.
- Produces: mismas clases que hoy (`panel`, `hero`, `heroMark`, `heroTitle`, `heroSubtitle`, `heroComposer`, `suggestionsLabel`, `suggestions`, `suggestion`, `suggestionCategory`, `suggestionText`, `panelHeader`, `newChatButton`, `messages`, `error`) — consumidas por `ChatPanel.tsx` (no se toca).

**Qué cambia:** sugerencias sin fondo/sombra (transparentes, hairline; hover solo cambia borde a acento y oscurece la tinta); se elimina la flecha deslizante `::after`; el stagger de entrada se reemplaza por un fade único de opacidad del hero; el botón "Nuevo chat" pierde el cambio de fondo al hover; más aire vertical en el hero. Las reglas de scrollbar quedan igual.

- [ ] **Step 1: Reemplazar el contenido completo de `frontend/src/components/chat/ChatPanel/ChatPanel.module.css` por:**

```css
.panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 46rem;
  height: 100%;
  min-height: 0;
  overflow-y: auto; /* en estado vacío el hero puede exceder pantallas cortas */
}

/* --- Estado vacío: saludo + composer centrado + preguntas por categoría --- */

.hero {
  position: relative;
  margin: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-4);
  padding: var(--space-8) 0;
}

.heroMark {
  color: var(--accent);
}

.heroTitle {
  font-family: var(--font-family-serif);
  font-size: var(--text-3xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: var(--navy);
}

.heroSubtitle {
  font-size: var(--text-lg);
  color: var(--ink-500);
  max-width: 32rem;
}

.heroComposer {
  margin-top: var(--space-4);
}

.suggestionsLabel {
  font-family: var(--font-family-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-500);
  margin-top: var(--space-3);
}

.suggestions {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  width: 100%;
}

@media (max-width: 540px) {
  .suggestions {
    grid-template-columns: 1fr;
  }
}

/* Sugerencia aplanada: hairline sin relleno ni sombra; el hover habla solo con tinta. */
.suggestion {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  text-align: start;
  font-family: inherit;
  background: transparent;
  border: 1px solid var(--ink-100);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.suggestion:hover,
.suggestion:focus-visible {
  border-color: var(--accent);
}

.suggestionCategory {
  font-family: var(--font-family-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
}

.suggestionText {
  font-size: var(--text-sm);
  color: var(--ink-700);
  transition: color 0.15s ease;
}

.suggestion:hover .suggestionText,
.suggestion:focus-visible .suggestionText {
  color: var(--ink-900);
}

/* --- Conversación --- */

.panelHeader {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-1) 0;
}

.newChatButton {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-family-display);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-500);
  background: transparent;
  border: 1px solid var(--ink-100);
  border-radius: 999px;
  padding: 0.375rem 0.875rem;
  cursor: pointer;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.newChatButton:hover:not(:disabled) {
  color: var(--navy);
  border-color: var(--accent);
}

.newChatButton:disabled {
  opacity: 0.6;
  cursor: default;
}

.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-1);
}

.error {
  margin: var(--space-2) 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--state-error) 8%, var(--surface));
  color: var(--state-error);
  font-size: var(--text-sm);
}

/* --- Movimiento (solo si el usuario no pidió reducirlo) --- */

/* Un único fade de opacidad del hero completo — sin stagger ni desplazamiento. */
@media (prefers-reduced-motion: no-preference) {
  .hero {
    animation: fade 0.4s ease both;
  }
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

/* --- Scrollbar del chat: fina y en la paleta, sin el gris pesado del navegador --- */

/* Firefox solo entiende las propiedades estándar (su scrollbar thin no tiene flechas). */
.panel,
.messages {
  scrollbar-width: thin;
  scrollbar-color: var(--ink-300) transparent;
}

/* Chromium/Safari: el camino ::-webkit-scrollbar da control total — el modo estándar
   de Chromium dibuja flechas stepper que no se pueden ocultar. Resetear las
   propiedades estándar a auto re-habilita las reglas webkit de abajo. */
@supports selector(::-webkit-scrollbar) {
  .panel,
  .messages {
    scrollbar-width: auto;
    scrollbar-color: auto;
  }

  .panel::-webkit-scrollbar,
  .messages::-webkit-scrollbar {
    width: 10px;
  }

  .panel::-webkit-scrollbar-track,
  .messages::-webkit-scrollbar-track {
    background: transparent;
  }

  /* Borde transparente + content-box: pastilla de 4px con aire, estilo del rediseño */
  .panel::-webkit-scrollbar-thumb,
  .messages::-webkit-scrollbar-thumb {
    background-color: var(--ink-300);
    border-radius: 999px;
    border: 3px solid transparent;
    background-clip: content-box;
  }

  .panel::-webkit-scrollbar-thumb:hover,
  .messages::-webkit-scrollbar-thumb:hover {
    background-color: var(--ink-500);
  }

  .panel::-webkit-scrollbar-button,
  .messages::-webkit-scrollbar-button {
    display: none;
    width: 0;
    height: 0;
  }
}
```

- [ ] **Step 2: Verificar lint y typecheck**

Run: `cd /home/bryan/LegalSeller/frontend && pnpm lint && pnpm typecheck`
Expected: ambos salen sin errores.

- [ ] **Step 3: Commit**

```bash
cd /home/bryan/LegalSeller
git add frontend/src/components/chat/ChatPanel/ChatPanel.module.css
git commit -m "feat(frontend): hero y sugerencias aplanadas — hairlines sin sombra ni stagger"
```

---

### Task 3: Mensajes editoriales

**Files:**
- Modify: `frontend/src/components/chat/MessageBubble/MessageBubble.module.css` (archivo completo abajo)

**Interfaces:**
- Consumes: tokens de `globals.css`.
- Produces: mismas clases que hoy (`userMessage`, `assistantMessage`, `assistantHeader`, `assistantAvatar`, `assistantName`, `markdown`, `thinking`) — consumidas por `MessageBubble.tsx` (no se toca). Este componente también lo usa `SesionView` de `/revision`: el cambio se ve ahí (aceptado en el spec).

**Qué cambia:** el mensaje del usuario deja la burbuja navy y pasa a bloque con fondo `--accent-soft`, tinta navy y radio chico; la respuesta del asistente deja de ser tarjeta (sin borde, sombra, fondo ni padding) y queda como texto directo al ancho de la columna; la balanza de la firma pierde la cajita navy y queda en azul acero; el pulso de "Buscando en el corpus…" se conserva.

- [ ] **Step 1: Reemplazar el contenido completo de `frontend/src/components/chat/MessageBubble/MessageBubble.module.css` por:**

```css
/* Bloque del consultante: presente pero silencioso — tinte suave, radio chico. */
.userMessage {
  align-self: flex-end;
  max-width: 78%;
  background: var(--accent-soft);
  color: var(--navy);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Respuesta del agente como texto editorial directo sobre el fondo, con firma liviana. */
.assistantMessage {
  align-self: flex-start;
  max-width: 100%;
  color: var(--ink-900);
}

.assistantHeader {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.assistantAvatar {
  display: grid;
  place-items: center;
  color: var(--accent);
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

- [ ] **Step 2: Correr los tests unitarios del componente**

Run: `cd /home/bryan/LegalSeller/frontend && pnpm test:unit run src/components/chat/MessageBubble`
Expected: PASS (los tests no dependen de valores CSS).

- [ ] **Step 3: Commit**

```bash
cd /home/bryan/LegalSeller
git add frontend/src/components/chat/MessageBubble/MessageBubble.module.css
git commit -m "feat(frontend): mensajes editoriales — bloque tenue del usuario y respuesta sin tarjeta"
```

---

### Task 4: Composer plano

**Files:**
- Modify: `frontend/src/components/chat/Composer/Composer.module.css` (archivo completo abajo)

**Interfaces:**
- Consumes: tokens de `globals.css`.
- Produces: mismas clases que hoy (`composer`, `input`, `sendButton`, `stopButton`, `srOnly`) — consumidas por `Composer.tsx` (no se toca).

**Qué cambia:** el composer pierde la sombra (hairline solo); el foco pasa a borde azul acero + anillo sutil de 2px en `--accent-soft` (se conserva un anillo porque el textarea suprime su outline y el foco de teclado debe seguir visible); el botón enviar pierde el gradiente (azul acero sólido, hover al tono fuerte); se elimina el scale al presionar (regla de movimiento del spec).

- [ ] **Step 1: Reemplazar el contenido completo de `frontend/src/components/chat/Composer/Composer.module.css` por:**

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
  transition: border-color 0.15s ease;
}

/* El textarea suprime su outline: el foco vive en el borde + anillo sutil. */
.composer:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
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
  transition: background 0.15s ease;
}

.sendButton {
  color: var(--surface);
  background: var(--accent);
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

- [ ] **Step 2: Correr los tests unitarios del componente**

Run: `cd /home/bryan/LegalSeller/frontend && pnpm test:unit run src/components/chat/Composer`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/bryan/LegalSeller
git add frontend/src/components/chat/Composer/Composer.module.css
git commit -m "feat(frontend): composer plano — hairline, foco sutil y botón sólido"
```

---

### Task 5: Verificación integral y visual

**Files:**
- Ninguno nuevo — verificación de lo anterior.

**Interfaces:**
- Consumes: los 4 CSS Modules restylados.
- Produces: evidencia de verificación (suite verde + screenshots).

- [ ] **Step 1: Suite completa del frontend**

Run: `cd /home/bryan/LegalSeller/frontend && pnpm lint && pnpm typecheck && pnpm test:unit run`
Expected: todo verde, sin tests rotos.

- [ ] **Step 2: Levantar el dev server del frontend en background**

Run: `cd /home/bryan/LegalSeller/frontend && pnpm dev` (en background, sin pipes — ver memoria del proyecto: usar `127.0.0.1`, no `localhost`).
Expected: server escuchando en el puerto 3000.

- [ ] **Step 3: Verificación visual del estado vacío**

Con el browser de Playwright (MCP): navegar a `http://127.0.0.1:3000`, screenshot en desktop (1280px) y móvil (390px de ancho, via resize). Confirmar contra el spec: header blanco con hairline y balanza azul, sin gradiente celeste, sugerencias planas transparentes, composer sin sombra.

- [ ] **Step 4: Verificación visual de la conversación (si el backend está disponible)**

Si el backend Mastra local está corriendo (o se puede levantar con `cd /home/bryan/LegalSeller/backend && pnpm dev` en background con la DB configurada): enviar una sugerencia del hero, esperar la respuesta y screenshot de la conversación. Confirmar: bloque del usuario con tinte celeste a la derecha, respuesta de Jurco como texto directo sin tarjeta, firma con balanza azul sin cajita navy. Si el backend no está disponible, dejarlo anotado y pedir verificación manual al usuario.

- [ ] **Step 5: Bajar los servers y commit final si hubo ajustes**

Matar los procesos dev lanzados. Si la verificación visual pidió retoques, aplicarlos, re-verificar y commitear con `fix(frontend): ajustes visuales post-verificación del rediseño editorial`.
