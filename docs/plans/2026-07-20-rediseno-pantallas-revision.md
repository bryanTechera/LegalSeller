# Spec — Rediseño de las pantallas de revisión (chat anotable estilo GitHub)

**Fecha:** 2026-07-20
**Estado:** aprobado (diseño validado con Bryan en sesión)
**Base:** sistema de revisión y feedback legal ya implementado
(`docs/plans/2026-07-20-sistema-revision-feedback-legal.md` — schema, endpoints,
timeline, máquina de estados de notas). Este spec NO cambia datos ni API: es un
rediseño de frontend.

## Problema

Las pantallas de `/revision` son un prototipo funcional visualmente crudo: colores
hardcodeados fuera del design system, burbujas de chat propias que no comparten nada
con `ChatPanel` (la pantalla real del consultante), el form de nota aparece al final
del chat en vez de junto al mensaje anotado, y las notas viven en un sidebar plano de
320px desconectado de la conversación.

## Objetivo

1. La pantalla de chat de revisión **reutiliza al máximo la pantalla de chat real**
   (mismas burbujas, mismo composer, mismo shell visual), con el agregado de notas.
2. El sistema de notas es **visualmente similar al code review de GitHub**: comentarios
   anclados inline bajo el elemento comentado, con hilos de respuestas, estados y
   resolución colapsable.

## Decisiones de diseño (validadas)

| Decisión | Elección |
|---|---|
| Ubicación de los hilos de notas | **Inline bajo cada mensaje** (GitHub puro). El sidebar de notas desaparece; el chat ocupa la columna única de 46rem como el chat real. |
| Anclaje de notas | **Selección de texto** dentro de la burbuja (pill flotante "Dejar nota"; `citaTexto` = selección exacta) + botón `+` por mensaje (hover) para anotar el mensaje entero. |
| Estrategia de reutilización | **Enfoque A: extraer primitivas compartidas** (`MessageBubble`, `Composer`) que consumen tanto `ChatPanel` como `SesionView`. Ni copia de estilos (drift) ni `ChatPanel` con modo revisión (contaminación). |

## 1. Shell y pantallas

`/revision` adopta el shell del home (`page.module.css` como referencia):

- Header navy con `BrandMark` + wordmark "Jurco" + chip distintivo "Revisión"
  (texto en `--on-navy-muted`, borde sutil). Sin footer (herramienta interna).
- Fondo `--paper` con el lavado celeste vertical del home (gradiente
  `color-mix(--accent 8%)` → transparente).
- **Acceso**: tarjeta centrada (`--surface`, `--radius-lg`, `--shadow-soft`), título
  en `--font-family-serif` estilo hero, inputs y botón primario del design system.
- **Listado**: tarjetas de sesión con el lenguaje de las suggestion cards del home
  (surface, borde `--ink-100`, hover borde `--accent` + `--shadow-raised` +
  translateY(-1px)). Badges: notas abiertas en `--state-warning`, con respuesta en
  `--accent` (fondo `--accent-soft`). Fila "Nueva sesión" con botón primario accent.
- **Sesión**: columna única centrada `max-width: 46rem` (la métrica de `.panel` del
  chat real). Header de sesión: título, "Creada por …", botón "Volver al listado"
  (secundario) y botón "Nota general".

## 2. Primitivas compartidas extraídas de ChatPanel

Dos componentes presentacionales puros, sin lógica de datos ni hooks propios:

### `frontend/src/components/chat/MessageBubble/`

- `MessageBubble.tsx` + `MessageBubble.module.css`.
- Props: `role: "user" | "assistant"`, `content: string`,
  `showThinking?: boolean` (indicador "Buscando en el corpus…" cuando el assistant
  está streameando con contenido vacío).
- Se mueven desde `ChatPanel.module.css` las clases: `.userMessage`,
  `.assistantMessage`, `.assistantHeader`, `.assistantAvatar`, `.assistantName`,
  `.markdown`, `.thinking` (y lo que dependa exclusivamente de ellas).
- Render assistant: header con avatar `BrandMark` + "Jurco", cuerpo
  `ReactMarkdown` + `remark-gfm`. Render user: burbuja navy alineada a la derecha.
- `aria-label` por rol ("Tu mensaje" / "Respuesta del asistente") se mantiene.

### `frontend/src/components/chat/Composer/`

- `Composer.tsx` + `Composer.module.css`.
- Props: `value`, `onChange`, `onSubmit`, `isStreaming`, `onStop?`, `placeholder`,
  `maxLength?`, `inputRef?`.
- Se mueven las clases `.composer`, `.input`, `.sendButton`, `.stopButton`,
  `.srOnly`. Conserva Enter-para-enviar (Shift+Enter = salto de línea) y los
  iconos SVG actuales de enviar/detener.

`ChatPanel` queda como orquestador (hero, sugerencias, scroll, error, su hook
`useChatStream`) consumiendo ambas primitivas. **Criterio de éxito: el home queda
visualmente idéntico** (verificación Playwright lado a lado antes/después).

`SesionView` consume las mismas primitivas para mensajes del timeline, burbuja
pendiente del usuario y burbuja de streaming.

## 3. Sistema de notas estilo GitHub (SesionView)

### Anclar una nota

- **Hover sobre un mensaje** → botón `+` circular (accent, sombra suave) en el borde
  superior-derecho de la burbuja — el análogo del gutter de GitHub. Click → abre el
  composer de nota anclado al mensaje entero (sin cita).
- **Selección de texto dentro de una burbuja** → pill flotante "Dejar nota"
  posicionado junto a la selección (via `window.getSelection()` en `mouseup`;
  válido solo si la selección está contenida en un único elemento con
  `data-message-id`). Click → composer de nota con `citaTexto` = texto seleccionado
  (truncado a 2000 chars, el límite ya validado por el endpoint).
- Helper puro **`citaDesdeSeleccion(selection, contenedor): { messageId, cita } | null`**
  en `frontend/src/lib/revision/seleccion.ts` — testeable sin DOM real (recibe la
  Selection y resuelve pertenencia + texto).

### Composer de nota inline

Se abre **directamente debajo del mensaje anotado** (no al final del chat): tarjeta
(`--surface`, borde `--ink-100`, `--radius-md`) con la cita en bloque citado (si la
hay), textarea con placeholder "¿Qué observaste en esta respuesta?", botones
Cancelar / "Guardar nota" (primario). Error de red visible inline (hoy falla en
silencio).

### Hilos inline (tarjeta de nota)

Debajo de cada mensaje, sus notas en orden cronológico. Cada tarjeta, look GitHub:

- Borde izquierdo de 3px según estado (ámbar/celeste/verde).
- Header: autor en semibold, fecha corta `es-UY`, chip de estado a la derecha.
- Bloque de cita (si hay `citaTexto`): fondo `--surface-muted`, borde izquierdo
  `--ink-300`, itálica, tipografía `--text-sm`.
- Texto de la nota.
- Respuestas anidadas (indentación + línea vertical sutil): DEV con fondo
  `--accent-soft`, EXPERTO con fondo `--surface-muted`; autor + fecha arriba de
  cada una.
- Pie (solo si no está RESUELTA): input "Responder…" de una línea que se expande a
  textarea + botones al recibir foco (patrón GitHub), y botón "Resolver"
  (secundario). Error de red visible inline.

### Estados y colapso

| Estado | Visual |
|---|---|
| ABIERTA | Chip "Abierta" ámbar (`--state-warning` sobre fondo cálido claro), borde izquierdo ámbar. |
| RESPONDIDA | Chip "Respondida" celeste (`--accent` sobre `--accent-soft`), borde izquierdo celeste. |
| RESUELTA | **Colapsada** a una línea: check + "Resuelta · N respuesta(s)" en `--state-success`, expandible/colapsable con click (estado local, default colapsado). |

### Notas generales

Notas con `messageId: null`: sección "Notas generales" **arriba de la conversación**
(entre el header de sesión y el primer mensaje), mismas tarjetas de hilo. Se crean
con el botón "Nota general" del header de sesión (mismo composer inline, sin cita).

## 4. Datos, API y errores

- **Cero cambios** de schema Prisma y de endpoints. Cambio semántico único:
  `citaTexto` pasa de slice automático de 300 chars a la selección real del experto
  (o ausente en notas de mensaje entero / generales).
- `crearNota` / `responderNota` / `resolverNota` muestran error inline en su tarjeta
  cuando la red falla (hoy: silencio).
- El timeline sigue mostrando solo items `tipo === "mensaje"` (los spans de
  tool-calls quedan para el flujo dev `feedback:pull`, fuera de alcance acá).

## 5. Fuera de alcance

- Cambios de schema, endpoints o máquina de estados de notas.
- Renderizado de tool-calls/spans en la UI del experto.
- Resaltado de la cita dentro del markdown del mensaje (la cita se muestra en la
  tarjeta del hilo, como el hunk de GitHub — no se pinta sobre la burbuja).
- Índice lateral de notas (descartado en diseño).
- Mobile-first profundo: el layout de columna única ya degrada bien; alcanza con que
  nada desborde en 375px.

## 6. Verificación

- `citaDesdeSeleccion`: tests unitarios (selección válida, selección que cruza
  mensajes → null, selección vacía → null, truncado a 2000).
- Tests unitarios existentes de revisión y chat siguen verdes; e2e
  `frontend/tests/revision.spec.ts` ajustado a la nueva estructura de la vista.
- Verificación visual Playwright: (a) home idéntico al estado previo (screenshot
  antes/después de la extracción), (b) recorrido completo de revisión: acceso →
  listado → sesión → enviar mensaje → nota por selección → nota de mensaje →
  responder → resolver (colapso) → nota general.
- Gates: `pnpm typecheck` + `pnpm lint` + `pnpm test:unit` (frontend).
