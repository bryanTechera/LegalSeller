# Rediseño editorial del chat del home — Design

**Fecha:** 2026-07-23
**Estado:** aprobado en brainstorming (pendiente de plan de implementación)

## Objetivo

Que el chat del home se vea más moderno y minimalista, reforzando el lado
premium/editorial de Jurco (estudio jurídico de prestigio) en un lienzo claro y
sobrio. Evolución dentro de la identidad actual (navy + azul acero sobre blancos
fríos): el cambio está en aplanar y quitar, no en cambiar la paleta.

## Alcance

Solo la pantalla del consultante (home: hero + conversación + composer). Fuera
de alcance: pantallas de `/revision`, tokens globales, tipografías.

**Archivos a tocar** (CSS Modules + retoques mínimos de markup):

- `frontend/src/app/page.module.css` (header, main, footer)
- `frontend/src/components/chat/ChatPanel/ChatPanel.module.css` (hero, sugerencias, mensajes, botón nuevo chat)
- `frontend/src/components/chat/MessageBubble/MessageBubble.module.css` (mensajes)
- `frontend/src/components/chat/Composer/Composer.module.css` (composer, botones)

`globals.css` no se toca: sus tokens los consumen también las pantallas de
`/revision`. Todo el cambio vive en cómo el chat consume esos tokens.

**Salvedad aceptada:** `MessageBubble` es compartido con `SesionView`
(`/revision`). El restyle de mensajes se verá también en la timeline del equipo
legal. Decisión: aceptarlo — es la misma conversación renderizada y la
coherencia visual suma; duplicar estilos sería peor de mantener.

## Dirección visual

Editorial aplanado, claro y sobrio, sin dorado:

- Lienzo papel frío uniforme; hairlines (`--ink-100`) en lugar de tarjetas con
  sombra.
- Serif editorial para el titular (ya existente); versalitas Poppins para
  etiquetas.
- Azul acero (`--accent`) como único acento; navy como tinta, no como fondo.
- Cero sombras y cero gradientes en el chat.

## Diseño por componente

### Header y marco de página

- Header claro: fondo blanco (`--surface`), wordmark "JURCO" en navy con la
  balanza en azul acero, hairline inferior como único límite. Reemplaza la
  barra navy sólida.
- Se elimina el lavado celeste degradado de `.main` — fondo papel uniforme.
- Footer legal sin cambios.

### Hero (estado vacío)

- Misma composición (marca, título serif, subtítulo, composer, sugerencias),
  con más aire vertical.
- Sugerencias aplanadas: fondo transparente, borde hairline, sin sombra.
  Hover: borde a azul acero y tinta más oscura — sin `translateY` ni flecha
  deslizante.
- Animación de entrada: un único fade suave de todo el hero (respetando
  `prefers-reduced-motion`), reemplaza el stagger por elemento.

### Conversación

- **Mensaje del usuario:** deja la burbuja navy. Bloque alineado a la derecha
  con fondo `--accent-soft`, tinta navy, radio chico.
- **Respuesta de Jurco:** deja de ser tarjeta. Texto directo sobre el fondo,
  sin borde ni sombra, al ancho de la columna. Conserva la firma superior, más
  liviana: balanza en azul acero sin la cajita navy, "JURCO" en versalitas.
- El indicador "Buscando en el corpus…" conserva su pulso (informativo).
- Botón "Nuevo chat": se alinea al lenguaje hairline; hover sin cambio de fondo.

### Composer

- Borde hairline, sin sombra.
- Foco: borde a azul acero más un anillo sutil de 2px en `--accent-soft`
  (reemplaza el anillo de 4px actual; se conserva un anillo porque el textarea
  suprime su outline propio y el foco de teclado debe seguir siendo visible).
- Botón enviar: azul acero sólido (sin gradiente), hover al tono fuerte.
  Estados disabled sin cambios.

### Movimiento

Regla general: las transiciones de color cortas (0.15s) se quedan; todo lo que
mueve píxeles (translateY en hover, flecha deslizante, stagger de entrada) se
va. Excepciones: el fade único del hero y el pulso de "Buscando…".

## Verificación

- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` en `frontend/` (los tests
  existentes no dependen de valores CSS; no deberían romper).
- Verificación visual con el dev server local: screenshots del estado vacío y
  de una conversación, en desktop y móvil, antes de dar por cerrado.

## Decisiones registradas

1. Alcance solo home (no `/revision`, no tokens globales).
2. Dirección premium/editorial sobre lienzo claro, sin acento dorado.
3. Los cuatro elementos señalados como molestia se cambian: header navy sólido,
   tarjetas con sombra, burbujas de mensajería, gradientes/microanimaciones.
4. Enfoque "editorial aplanado" (se mantiene estructura de chat) sobre el
   transcript sin burbujas y sobre el retoque mínimo.
5. El restyle de `MessageBubble` alcanza también a `/revision` (componente
   compartido, aceptado).
