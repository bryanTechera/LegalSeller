# Board — tab Casos (bandeja de leads)

**Fecha**: 2026-08-11
**Estado**: aprobado, pendiente de plan de implementación
**Alcance**: sección `Casos` del board interno — tab propio con el listado de todos los `Caso` (nuevos e históricos) y estado de gestión editable por el equipo humano, sobre la ficha de caso que ya existe.

---

## 1. Problema y objetivo

El `Caso` es **el deliverable del sistema** (`docs/vision-producto.md` §5): el lead que el equipo humano deriva a un abogado de la red. La ficha individual ya está construida (`docs/plans/2026-08-08-sintesis-caso-board.md`, implementado): `/board/casos/[id]` muestra la síntesis generada con IA, el contacto y las notas del equipo legal.

Faltan las dos piezas que la convierten en una bandeja de trabajo:

1. **No hay puerta de entrada.** El tab `Casos` no existe en el sidebar y `/board/casos` (sin id) es 404. A una ficha solo se llega desde la tabla "Casos captados" de Métricas — 100 filas del rango, un solo estado, sin filtros ni paginación. El breadcrumb de la ficha dice "← Métricas" justamente porque ese es hoy el único camino.
2. **No hay estado de gestión.** Nada registra qué se hizo con cada lead. Un caso sin contactar se ve igual que uno ya derivado, así que el estado real vive en la cabeza de quien atiende o en un WhatsApp, y no sobrevive a que esa persona esté de licencia.

El diseño original del board (`docs/plans/2026-08-01-board-administracion.md` §2) dejó la bandeja de casos explícitamente **fuera de alcance**. Este documento la incorpora.

### Qué responde la sección

1. **¿Qué leads hay para trabajar?** — los `CAPTADO` sin gestión, primero.
2. **¿Qué se hizo con cada uno?** — contactado, derivado, descartado, por quién y cuándo.
3. **¿Dónde está todo lo demás?** — la ficha ya responde qué dice el caso; el listado es lo que faltaba para llegar a ella.

---

## 2. Decisiones tomadas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Naturaleza de la sección | Bandeja de trabajo, con escritura | Vista de consulta solo lectura |
| Ciclo de gestión | `NUEVO` → `CONTACTADO` → `DERIVADO` / `DESCARTADO` | Solo tomar/descartar; ciclo con asignación a persona |
| Modelo de datos | Columnas en `Caso` + `CasoEvento` tipo `GESTION` | Estado derivado de eventos; tabla `GestionCaso` 1-1 |
| Alcance del listado | Todos los casos, con el filtro abierto en `CAPTADO` | Solo captados; todos sin filtro por defecto |
| Ficha | Extender la existente | Ficha nueva; panel lateral; transcript embebido |
| Historia visible en la ficha | Solo los eventos de gestión | Todo el trail de `CasoEvento` (clasificación y registro de datos son diagnóstico técnico: eso se lee en `/board/chats`) |
| Backfill de históricos | Ninguno: entran como `NUEVO` | Marcar los viejos como ya gestionados |

### 2.1 Por qué columnas y no estado derivado

El punto entero de la bandeja es filtrar y ordenar por estado de gestión. Derivarlo del último `CasoEvento` obliga a un `DISTINCT ON` por caso en cada request y hace imposible paginar por estado sin materializar. La columna da el estado vigente en una query; `CasoEvento` —que el schema ya define como *"append-only audit trail for the human team that classifies and derives"*— conserva la historia. Las dos piezas ya existen; no hace falta una tabla nueva.

### 2.2 `gestion` y `estado` son ejes distintos

`Caso.estado` (`EN_CONVERSACION` / `CAPTADO` / `FUERA_DE_COBERTURA`) lo escribe **el agente**: describe qué pasó en la conversación. `Caso.gestion` lo escribe **el equipo humano**: describe qué hizo con el lead. Ninguno de los dos escribe el otro, ni ahora ni después. Un caso `CAPTADO` + `DESCARTADO` es un estado válido y frecuente: llegó el contacto, el caso no calificó.

Mezclarlos —agregar `DERIVADO` al enum `CasoEstado`, por ejemplo— rompería el funnel de métricas, que cuenta `estado: "CAPTADO"` como la conversión del sistema: un lead trabajado dejaría de contarse como captado y el KPI bajaría al derivar casos, que es exactamente lo contrario de lo que mide.

### 2.3 La gestión no mueve `updatedAt` de otra cosa

El cambio de gestión escribe en `Caso`, así que **sí** mueve `Caso.updatedAt` — y eso es correcto: es el orden del listado de captados y de la bandeja, y un caso recién gestionado subiendo es el comportamiento esperado. Lo que no debe tocar es `SintesisCaso`: la huella de la síntesis se calcula sobre el material del caso, y hacerle creer que el material cambió dispararía una regeneración con IA por cada click de gestión. Por eso el `PATCH` no toca esa tabla ni ninguno de los campos que entran a la huella.

---

## 3. Modelo de datos

Migración aditiva sobre `frontend/prisma/schema.prisma` (segura sobre la base compartida entre worktrees: no toca ninguna columna existente):

```prisma
model Caso {
  // … campos existentes
  /// Estado de gestión del equipo humano. Eje independiente de `estado`, que
  /// lo escribe el agente: un caso CAPTADO puede estar DESCARTADO.
  gestion      CasoGestion @default(NUEVO)
  /// Nota interna del último cambio de gestión. Las notas de contenido del
  /// caso van a `NotaCaso`; esto es el "por qué" del cambio de estado.
  gestionNota  String?
  /// Nombre de quien hizo el último cambio, resuelto server-side.
  gestionPor   String?
  gestionEn    DateTime?

  @@index([gestion, updatedAt(sort: Desc)])
}

enum CasoGestion {
  NUEVO
  CONTACTADO
  DERIVADO
  DESCARTADO
}

enum CasoEventoTipo {
  CLASIFICACION
  CORRECCION
  REGISTRO_DATO
  CONTACTO
  GESTION      // nuevo
}
```

Los casos históricos toman el default `NUEVO`, sin backfill: nadie sabe hoy cuáles se trabajaron, y marcarlos como gestionados inventaría información. El equipo los procesa desde la bandeja como a cualquier otro.

El `payload` del `CasoEvento` de gestión guarda `{ de, a, nota, por }` — el estado anterior incluido, para que el trail se lea sin reconstruir el orden.

---

## 4. Arquitectura

Lo que **ya existe** y se extiende:

```
frontend/src/
├─ lib/casos/caso-detalle.ts                   obtenerCaso → síntesis + contacto + notas
├─ app/api/board/casos/[id]/route.ts           GET ficha
├─ app/api/board/casos/[id]/notas/route.ts     POST nota del equipo legal
├─ app/api/board/casos/[id]/sintesis/route.ts  POST regenerar síntesis
├─ app/board/casos/[id]/page.tsx               → DetalleCaso
└─ components/board/Casos/DetalleCaso.tsx      ficha (+ casos.module.css)
```

Lo que se **agrega**:

```
frontend/src/
├─ lib/casos/situacion.ts                      situacionDe() — extraída de board/captados.ts
├─ lib/casos/gestion.ts                        actualizarGestion()
├─ lib/board/casos.ts                          listarCasos()
├─ lib/validations/board.ts                    + filtrosCasosSchema, actualizarGestionSchema
├─ app/api/board/casos/route.ts                GET listado paginado
├─ app/api/board/casos/[id]/gestion/route.ts   PATCH cambio de gestión
├─ app/board/casos/page.tsx                    → ListadoCasos
└─ components/board/Casos/ListadoCasos.tsx
```

### 4.1 Listado — `lib/board/casos.ts`

Módulo `server-only`, mismo patrón que `conversaciones.ts`. Vive en `lib/board/` y no en `lib/casos/` porque es una vista del board sobre muchos casos, como `captados.ts`; `lib/casos/` es la lógica de un caso.

**`listarCasos(filtros): Promise<PaginaCasos>`**

Alcance por `casosReales(desde)` de `scope.ts` — las sesiones de revisión y las corridas del runner nunca entran a la bandeja, y la condición no se escribe inline (regla de `CLAUDE.md`: `scope.ts` es la única definición de "caso real"). Filtros: rango, `gestion`, `estado`, `categoria`, y búsqueda sobre los tres campos de contacto (`contains`, `mode: "insensitive"`). Orden `updatedAt desc` con cursor por id, 30 por página, igual que `listarConversaciones`.

Cada fila trae: id, `conversationId`, fecha de creación, última actividad, gestión, estado, categoría, subcategorías, contacto y `situacion`.

`situacion` sale de la síntesis **ya guardada** (`sintesis.contenido.situacion`), nunca se genera desde el listado: `asegurarSintesis` llama al modelo, y treinta llamadas por página convertirían la bandeja en un cuello de botella. El caso sin síntesis muestra "—" y la genera al abrir la ficha, que es donde el costo se justifica. Es la misma decisión ya tomada en `listarCaptados`, y el helper `situacionDe` se extrae a `lib/casos/situacion.ts` para que las dos vistas lean el Json con el mismo criterio.

`ultimaActividad` sale de `MAX(mastra_messages.createdAt)` del thread, en una sola query por página (patrón exacto de `listarCaptados`), y cae a `updatedAt` del caso cuando el thread no tiene mensajes persistidos.

### 4.2 Gestión — `lib/casos/gestion.ts`

**`actualizarGestion({ casoId, gestion, nota, por }): Promise<GestionCasoVista | null>`**

Transacción: `updateMany` guardado por `casosReales(null)` (para que un caso de sesión de revisión no se pueda gestionar ni conociendo su id) + `create` del `CasoEvento` tipo `GESTION`. Si el `updateMany` afecta 0 filas, no escribe evento y devuelve `null` → 404. El payload registra el estado anterior.

Devuelve la gestión vigente más su historia (`listarGestion`), que es lo que la ficha necesita para re-renderizar sin recargar el caso entero.

No hay guard de transición: cualquier estado puede ir a cualquier otro. Un caso descartado por error se reabre poniéndolo en `CONTACTADO`, y el trail deja la corrección a la vista.

`obtenerCaso` (`caso-detalle.ts`) suma al `DetalleCaso` la gestión vigente y el historial de eventos `GESTION` — sin tocar la síntesis ni las notas.

### 4.3 API

Las rutas nuevas arrancan con `auth()` y devuelven 401 sin sesión, igual que las existentes. El matcher de `src/proxy.ts` ya cubre `/board/*` y `/api/board/*` — no se toca (tocarlo es el gotcha documentado en `CLAUDE.md`).

| Ruta | Verbo | Contrato |
|---|---|---|
| `/api/board/casos` | GET | `filtrosCasosSchema` sobre los search params → `PaginaCasos` |
| `/api/board/casos/[id]/gestion` | PATCH | `{ gestion, nota? }` → `GestionCasoVista` \| 404 |

El autor del cambio sale de la sesión Auth.js **server-side** (`sesion.user.name ?? sesion.user.email`); un `autor` en el body se ignora. Es exactamente lo que hace `POST .../notas`, su ruta hermana. No se usa `getIdentidadBoard()` a propósito: esa función acepta además la cookie del runner de escenarios, y el runner no gestiona leads — sin sesión humana, el PATCH es 401.

### 4.4 UI

**Sidebar** — `Casos` entra segundo, entre Métricas y Chats: es el deliverable del sistema, no un anexo.

**`/board/casos`** — `ListadoCasos.tsx`, cliente, SWR + `PaginaExtra` (el acumulado de páginas atado a la firma de filtros, que descarta respuestas de filtros ya cambiados) tal como `ListadoChats`. Barra de filtros: rango, gestión, estado, categoría, buscar contacto. Tabla: Última actividad · Gestión (badge) · Estado · Categoría · Contacto · Situación (extracto de la síntesis, link a la ficha). Abre con `gestion` en todas y `estado` en `CAPTADO`, con los selects visibles para ampliar.

**`/board/casos/[id]`** — la ficha existente suma un bloque **Gestión**: el estado actual, los cuatro botones, un campo de nota interna opcional y la lista de cambios anteriores con autor y fecha. Va arriba de todo, junto al contacto: es lo primero que alguien necesita saber al abrir un lead. El breadcrumb "← Métricas" pasa a "← Casos".

**Métricas** — la tabla "Casos captados" queda igual, con un link "Ver todos" al tab nuevo.

Estilo: se extiende `casos.module.css`, que ya sirve a la ficha. Los badges de gestión usan color solo como refuerzo — el texto del estado siempre está.

---

## 5. Errores y bordes

| Situación | Comportamiento |
|---|---|
| Caso inexistente o de sesión de revisión | 404 en el PATCH (el guard está en la query, no en la UI) |
| PATCH sin sesión humana | 401 (el runner de escenarios no tiene sesión Auth.js, así que cae acá) |
| `gestion` fuera del enum | 400 del `parseRequestBody` con Zod |
| Caso sin contacto (`EN_CONVERSACION`) | Se lista y se gestiona igual; las celdas de contacto muestran "—" |
| Caso sin síntesis guardada | `situacion` es null → la celda muestra "—"; el listado nunca genera síntesis |
| Thread sin mensajes persistidos | `ultimaActividad` cae a `updatedAt` del caso |
| Falla de red en el PATCH | La ficha muestra el error y rehabilita los botones; no hay optimistic update mudo (mismo criterio que el composer de notas) |

---

## 6. Testing

- **Vitest sobre `casos.ts`**: excluye sesiones de revisión, aplica el filtro por defecto, pagina por cursor, ordena por última actividad, y sirve `situacion` null sin llamar a `asegurarSintesis`.
- **Vitest sobre `gestion.ts`**: escribe el evento con el estado anterior; un id inexistente no deja evento huérfano y devuelve null.
- **Vitest sobre las rutas nuevas** (patrón de `casos/[id]/notas/route.test.ts`): 401 sin sesión, 400 con `gestion` inválida, 404, 200 — y que un `autor` mandado en el body se ignore.
- **Test de componente** para `ListadoCasos` (patrón `ListadoChats.test.tsx`): filtros, estado vacío, "Cargar más"; y extensión de `DetalleCaso.test.tsx` para el bloque de gestión.
- **E2E** (`tests/board.spec.ts`): navegar al tab, abrir una ficha, cambiar la gestión y ver el cambio reflejado en el listado.

Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` y `pnpm test` del frontend. No toca prompts ni corpus, así que no corresponde `pnpm evals`.

---

## 7. Fuera de alcance

- Asignación de un caso a una persona o a un abogado concreto de la red.
- Notificación por mail cuando entra un caso nuevo.
- Export CSV de la bandeja.
- Cualquier cambio en lo que escriben los agentes (`registrar-caso`, clasificación, corrección) o en cómo se genera la síntesis.
- Métricas de gestión (tiempo hasta el contacto, tasa de derivación). Los eventos quedan escritos desde el día uno, así que la sección de Métricas se puede alimentar de ellos más adelante sin migración nueva.
