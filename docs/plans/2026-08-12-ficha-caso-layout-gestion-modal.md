# Ficha del caso — layout en dos columnas y gestión en modal

**Fecha**: 2026-08-12
**Estado**: aprobado, pendiente de implementación
**Alcance**: la ficha del caso (`/board/casos/[id]`, `DetalleCaso.tsx`). El listado de la bandeja no se toca.

---

## 1. Problema y objetivo

La ficha nació como una columna de `42rem` (`casos.module.css:1-5`) con cinco bloques apilados: encabezado, resumen, gestión, contacto y notas. Sobre el board —que ya descuenta la sidebar de `15rem` y `2rem` de padding— eso deja más de la mitad del ancho vacío y obliga a scrollear para llegar a las notas, que es donde el equipo escribe.

Además, el bloque de gestión mezcla dos cosas que no se leen igual. Lo que el caso **dice** (resumen, contacto, notas) es material de lectura; en qué **anda el lead** es una acción del equipo humano. Hoy conviven en la misma columna, y la acción se lleva el lugar de mejor lectura de la ficha, arriba de todo.

El objetivo es doble: que la ficha entre en una pantalla sin scroll para un caso típico, y que la gestión deje de competir con la información.

### Qué NO es el problema

El eje `gestion` en sí, ni el contrato de la API, ni el modelo de datos: todo eso quedó definido y funcionando en `docs/plans/2026-08-11-board-casos.md` y no se toca. Esto es un cambio de presentación, más un ajuste de interacción sobre el guardado (§2, tercera fila).

---

## 2. Decisiones tomadas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Reparto del ancho | Encabezado ancho + dos columnas: resumen `2fr`, lateral `1fr` con contacto y notas | Columnas 50/50; contacto en el encabezado; una sola columna más ancha |
| Gestión | Botón flotante `Gestionar` que abre un modal | Bloque inline (hoy); panel lateral; acordeón |
| Qué se lleva el modal | Botones de estado, nota del cambio e historial completo | Dejar el historial en la ficha |
| Qué queda en la ficha | Badge del estado vigente + una línea con el último cambio (quién y cuándo) | Solo el badge |
| Guardado | Elegir estado + nota → `Guardar cambio` → PATCH y cierra | Guardar al instante al clickear el estado (comportamiento actual) |
| Implementación del modal | Overlay propio con `role="dialog"` | `<dialog>` nativo con `showModal()` |
| Re-registrar el mismo estado | No: `Guardar cambio` deshabilitado si el estado elegido es el vigente | Permitirlo y escribir un evento `X → X` |

### 2.1 Por qué el lateral y no columnas parejas

La altura de la página pasa a ser la del bloque más alto en vez de la suma de todos. El resumen es el bloque largo y variable (situación, hechos, datos, pedido, faltantes); contacto y notas son cortos y de alto acotado. Apilarlos en un lateral angosto los hace correr en paralelo al resumen sin robarle medida de lectura, mientras que dos columnas parejas le darían al contacto —tres pares etiqueta/valor— la mitad de la pantalla.

### 2.2 Por qué el guardado explícito

El flujo actual dispara el PATCH en el click del botón de estado y manda como nota lo que haya en el input en ese momento (`DetalleCaso.tsx:55-82`). O sea: la nota hay que escribirla **antes** de elegir el estado, al revés de como se lee el formulario, y no hay forma de arrepentirse. Dentro de un modal el orden natural es elegir, anotar y confirmar; `Cancelar` y `Esc` pasan a ser salidas sin efecto.

### 2.3 Por qué un overlay propio y no `<dialog>`

`showModal()` da top-layer, backdrop y foco atrapado gratis, pero **jsdom 27.4.0 no implementa `HTMLDialogElement.showModal`** (verificado en este repo: `d.showModal is not a function`). Los tests de componente corren sobre jsdom, así que el nativo dejaría el modal sin poder abrirse en los tests — el escenario que más importa cubrir. El overlay propio queda con `role="dialog"`, `aria-modal="true"` y `aria-labelledby`, cierre por `Esc` y por click en el fondo, y foco que entra al modal al abrir y vuelve al botón al cerrar.

### 2.4 Por qué no se puede re-guardar el mismo estado

`CasoEvento` es un trail de auditoría append-only: un evento `Contactado → Contactado` no registra un cambio, solo ruido que hay que saltear al leer la historia. Una nota sin cambio de estado ya tiene su lugar propio en *Notas del equipo legal*, que es exactamente el bloque para lo que se averiguó por fuera del chat.

---

## 3. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ ← Casos                                                      │
│ laboral · despido — captado                    [● Contactado]│
│ Contactado por Bryan · 11/08/2026 15:20                      │
│ Abierto el 08/08/2026 10:14 · última actividad 08/08 10:52   │
├────────────────────────────────────────┬─────────────────────┤
│ RESUMEN DEL CASO           [Regenerar] │ CONTACTO            │
│  situación · qué pasó · datos          │  nombre/tel/mail    │
│  qué pide · falta averiguar            ├─────────────────────┤
│  Ver chat completo →                   │ NOTAS DEL EQUIPO    │
│                                        │  composer + lista   │
└────────────────────────────────────────┴─────────────────────┘
                                          ( Gestionar ) ← fija
```

- **Grilla**: `grid-template-columns: minmax(0, 2fr) minmax(17rem, 1fr)`, `gap: var(--space-6)`, `max-width: 76rem`. El `minmax(0, …)` de la principal evita que un dato largo del resumen estire la columna (mismo motivo que el `min-width: 0` de `.contenido` en `board.module.css`).
- **Responsive**: abajo de `64rem` colapsa a una columna en orden resumen → contacto → notas. La sidebar del board ya colapsa por su cuenta en `48rem`.
- **Datos del caso** (dentro del resumen): pasa de un par por fila a `repeat(auto-fit, minmax(14rem, 1fr))`. Hoy cada valor ocupa una fila entera aunque sean dos palabras, y son el bloque que más alto gasta. Se hace con una clase propia (`.datosSintesis`): `.datos` lo comparte el contacto, que en el lateral angosto tiene que seguir siendo de una columna.
- **Medida de lectura**: la situación y los párrafos del resumen se topan en ~62ch para que ensanchar la columna no arruine la lectura.
- **Encabezado**: suma el badge del estado de gestión y, cuando hay gestión registrada, la línea "Contactado por Bryan · 11/08/2026 15:20" (de `gestion.estado`, `gestion.por` y `gestion.en`, que `GestionCaso` ya expone). Sin gestión previa, esa línea no se renderiza.
- **Botón flotante**: `position: fixed` abajo a la derecha del viewport, píldora con `--accent` y `--shadow-raised`. Vive en la ficha, no en el layout del board.

---

## 4. Componentes

```
frontend/src/components/board/Casos/
├─ DetalleCaso.tsx        encabezado + grilla + bloques informativos (deja de manejar el PATCH)
├─ ModalGestion.tsx       NUEVO — botón flotante, modal, PATCH y su estado de error
├─ ModalGestion.test.tsx  NUEVO
├─ DetalleCaso.test.tsx   ajustes (el bloque Gestión ya no está inline)
└─ casos.module.css       grilla, lateral, botón flotante, overlay, datos en auto-fit
```

**Frontera entre los dos**: `ModalGestion` recibe `casoId` y la `GestionCaso` vigente, y es dueño de todo lo suyo — el botón, la apertura, la selección local, la nota, el fetch y el error. Avisa hacia arriba con `onGuardado(gestion)`. `DetalleCaso` sigue siendo el único dueño del SWR y aplica ese resultado con el `mutate` de dos argumentos que ya usa hoy (`revalidate: false`), porque revalidar el caso entero vuelve a pasar por `obtenerCaso` → `asegurarSintesis` → `construirTimeline` para actualizar un badge.

`ModalGestion` no importa `useSWR` ni conoce la ruta de la ficha: se puede montar en un test con props planas.

---

## 5. Errores y bordes

| Situación | Comportamiento |
|---|---|
| PATCH falla (red o 4xx/5xx) | El modal queda abierto, muestra el aviso y rehabilita los botones; no se pierde la nota tipeada (mismo criterio que el composer de notas) |
| Cerrar sin guardar (`×`, `Cancelar`, `Esc`, click en el fondo) | Se descartan la selección y la nota; no se dispara ningún PATCH |
| Estado elegido = vigente | `Guardar cambio` deshabilitado |
| Guardado en curso | Botones y estados deshabilitados; el modal no cierra hasta la respuesta |
| Caso sin gestión previa | El badge muestra "Nuevo" y la línea de último cambio no se renderiza |
| Caso sin síntesis | El lateral se renderiza igual: no depende del resumen |
| Pantalla angosta (< 64rem) | Una columna; el botón flotante sigue fijo abajo a la derecha |

---

## 6. Testing

- **`ModalGestion.test.tsx`** (nuevo): el modal no está en el DOM hasta el click en `Gestionar`; seleccionar un estado no dispara el PATCH; `Guardar cambio` manda `{ gestion, nota }` al endpoint correcto y cierra el modal; un error deja el modal abierto con el aviso; `Esc` y `Cancelar` cierran sin PATCH; `Guardar cambio` arranca deshabilitado con el estado vigente seleccionado.
- **`DetalleCaso.test.tsx`**: se ajusta a que el bloque Gestión ya no está inline — el badge y la línea de último cambio se afirman sobre el encabezado, y los bloques informativos siguen presentes.
- **E2E `tests/board.spec.ts`**: el test "la bandeja de casos abre la ficha y guarda la gestión" pasa a abrir el modal para leer el estado vigente, cambiarlo y guardarlo. Se conserva intacta la restauración del lead real al final, que es lo que evita marcar a un consultante de verdad como contactado.
- **`tests/casos.spec.ts`**: no cambia — afirma sobre "Resumen del caso", "Contacto", "Notas del equipo legal" y "Ver chat completo", que siguen existiendo con el mismo nombre accesible.

Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` y `pnpm test` del frontend. No toca prompts, corpus ni tools, así que no corresponde `pnpm evals`.

Verificación visual local con capturas de la ficha y del modal antes del push, pedida explícitamente por el usuario.

---

## 7. Fuera de alcance

- El listado de la bandeja (`/board/casos`) y su barra de filtros.
- Gestionar un caso desde el listado sin abrir la ficha.
- Cualquier cambio en el modelo de datos, el contrato de la API o el eje `gestion` definido en `2026-08-11-board-casos.md`.
- Transcript del chat embebido en la ficha (sigue siendo un link a `/board/chats/[id]`).
- Una librería de focus trap: el modal maneja foco de entrada y retorno, sin ciclado de `Tab`.
