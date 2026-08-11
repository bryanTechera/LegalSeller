# Board — tab Casos (bandeja de leads)

**Fecha**: 2026-08-11
**Estado**: aprobado, pendiente de plan de implementación
**Alcance**: sección `Casos` del board interno — listado y ficha de todos los `Caso` (nuevos e históricos) con estado de gestión editable por el equipo humano.

---

## 1. Problema y objetivo

El `Caso` es **el deliverable del sistema** (`docs/vision-producto.md` §5): el lead que el equipo humano deriva a un abogado de la red. Hoy el board lo muestra de dos formas parciales:

- **Métricas** trae la tabla "Casos captados" — los 100 más recientes del rango, con contacto, sin filtros y sin detalle.
- **Chats** los muestra como anexo de la conversación que los produjo, orientado a leer el transcript, no a trabajar el lead.

Lo que falta es la superficie donde el equipo **trabaja** los casos: verlos todos, filtrarlos, abrir la ficha con lo que se recabó, y dejar registrado qué se hizo con cada uno. Sin eso, el estado de gestión vive en la cabeza de quien atiende (o en un WhatsApp), y un lead sin contactar se ve igual que uno ya derivado.

El diseño original del board (`docs/plans/2026-08-01-board-administracion.md` §2) dejó la bandeja de casos explícitamente **fuera de alcance**. Este documento la incorpora.

### Qué responde la sección

1. **¿Qué leads hay para trabajar?** — los `CAPTADO` sin gestión, primero.
2. **¿Qué se hizo con cada uno?** — contactado, derivado, descartado, por quién y cuándo.
3. **¿Qué sabemos del caso?** — contacto, categoría y subcategorías, datos recabados, historia completa de eventos, y el link a la conversación de origen.

---

## 2. Decisiones tomadas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Naturaleza de la sección | Bandeja de trabajo, con escritura | Vista de consulta solo lectura |
| Ciclo de gestión | `NUEVO` → `CONTACTADO` → `DERIVADO` / `DESCARTADO` | Solo tomar/descartar; ciclo con asignación a persona |
| Modelo de datos | Columnas en `Caso` + `CasoEvento` tipo `GESTION` | Estado derivado de eventos; tabla `GestionCaso` 1-1 |
| Alcance del listado | Todos los casos, con el filtro abierto en `CAPTADO` | Solo captados; todos sin filtro por defecto |
| Detalle | Página propia `/board/casos/[id]` | Panel lateral; página con el transcript embebido |
| Backfill de históricos | Ninguno: entran como `NUEVO` | Marcar los viejos como ya gestionados |

### 2.1 Por qué columnas y no estado derivado

El punto entero de la bandeja es filtrar y ordenar por estado de gestión. Derivarlo del último `CasoEvento` obliga a un `DISTINCT ON` por caso en cada request y hace imposible paginar por estado sin materializar. La columna da el estado vigente en una query; `CasoEvento` —que el schema ya define como *"append-only audit trail for the human team that classifies and derives"*— conserva la historia. Las dos piezas ya existen; no hace falta una tabla nueva.

### 2.2 `gestion` y `estado` son ejes distintos

`Caso.estado` (`EN_CONVERSACION` / `CAPTADO` / `FUERA_DE_COBERTURA`) lo escribe **el agente**: describe qué pasó en la conversación. `Caso.gestion` lo escribe **el equipo humano**: describe qué hizo con el lead. Ninguno de los dos escribe el otro, ni ahora ni después. Un caso `CAPTADO` + `DESCARTADO` es un estado válido y frecuente: llegó el contacto, el caso no calificó.

Mezclarlos —agregar `DERIVADO` al enum `CasoEstado`, por ejemplo— rompería el funnel de métricas, que cuenta `estado: "CAPTADO"` como la conversión del sistema: un lead trabajado dejaría de contarse como captado y el KPI bajaría al derivar casos, que es exactamente lo contrario de lo que mide.

---

## 3. Modelo de datos

Migración Prisma sobre `frontend/prisma/schema.prisma`:

```prisma
model Caso {
  // … campos existentes
  /// Estado de gestión del equipo humano. Eje independiente de `estado`, que
  /// lo escribe el agente: un caso CAPTADO puede estar DESCARTADO.
  gestion      CasoGestion @default(NUEVO)
  /// Nota interna libre del último cambio de gestión (nunca visible al consultante).
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

```
frontend/src/
├─ lib/board/casos.ts                          listar / obtener / actualizar gestión
├─ lib/validations/board.ts                    + filtrosCasosSchema, actualizarGestionSchema
├─ app/api/board/casos/route.ts                GET listado paginado
├─ app/api/board/casos/[id]/route.ts           GET ficha
├─ app/api/board/casos/[id]/gestion/route.ts   PATCH cambio de estado
├─ app/board/casos/page.tsx                    → ListadoCasos
├─ app/board/casos/[id]/page.tsx               → FichaCaso
└─ components/board/Casos/
   ├─ ListadoCasos.tsx
   ├─ FichaCaso.tsx
   └─ casos.module.css
```

### 4.1 Capa server — `lib/board/casos.ts`

Módulo `server-only`, mismo patrón que `conversaciones.ts`.

**`listarCasos(filtros): Promise<PaginaCasos>`**

Alcance por `casosReales(desde)` de `scope.ts` — las sesiones de revisión y las corridas del runner nunca entran a la bandeja, y la condición no se escribe inline (regla de `CLAUDE.md`: `scope.ts` es la única definición de "caso real"). Filtros: rango, `gestion`, `estado`, `categoria`, y búsqueda sobre los tres campos de contacto (`contains`, `mode: "insensitive"`). Orden `updatedAt desc` con cursor por id, 30 por página, igual que `listarConversaciones`.

Cada fila trae: id, fecha de creación y de última actividad, gestión, estado, categoría y subcategorías, contacto, un extracto del resumen, y el `conversationId`.

`ultimaActividad` sale de `MAX(mastra_messages.createdAt)` del thread, en una sola query por página (patrón exacto de `listarCaptados`), y cae a `updatedAt` del caso cuando el thread no tiene mensajes persistidos.

**`obtenerCaso(id): Promise<DetalleCaso | null>`**

Ficha completa: contacto, categoría, subcategorías, resumen parseado con Zod (shape desconocido → null, como ya hace `metricas-funnel`), `correccionAplicada`, gestión vigente con autor y fecha, todos los `CasoEvento` ordenados por `createdAt asc`, y de la conversación de origen su id, fecha y si es la activa. Devuelve `null` si el caso no existe o pertenece a una sesión de revisión.

**`actualizarGestion({ id, gestion, nota, por }): Promise<DetalleCaso | null>`**

Transacción: `updateMany` guardado por `casosReales(null)` (para que un caso de revisión no se pueda gestionar ni conociendo su id) + `create` del `CasoEvento`. Si el `updateMany` afecta 0 filas, no escribe evento y devuelve `null` → 404. Registra el estado anterior en el payload.

No hay guard de transición: cualquier estado puede ir a cualquier otro. Un caso descartado por error se reabre poniéndolo en `CONTACTADO`, y el trail deja la corrección a la vista.

### 4.2 API

Las tres rutas arrancan con `auth()` y devuelven 401 sin sesión. El matcher de `src/proxy.ts` ya cubre `/board/*` y `/api/board/*` — no se toca (tocarlo es el gotcha documentado en `CLAUDE.md`).

| Ruta | Verbo | Contrato |
|---|---|---|
| `/api/board/casos` | GET | `filtrosCasosSchema` sobre los search params → `PaginaCasos` |
| `/api/board/casos/[id]` | GET | → `DetalleCaso` \| 404 |
| `/api/board/casos/[id]/gestion` | PATCH | `{ gestion, nota? }` → `DetalleCaso` \| 404 |

El autor del cambio sale de `getIdentidadBoard()` **server-side**; el body nunca lo transporta. Con identidad de tipo `runner` (la cookie del runner de escenarios) el PATCH responde 403: el runner no gestiona leads.

### 4.3 UI

**Sidebar** — `Casos` entra segundo, entre Métricas y Chats: es el deliverable del sistema, no un anexo.

**`/board/casos`** — `ListadoCasos.tsx`, cliente, SWR + `PaginaExtra` (el acumulado de páginas atado a la firma de filtros, que descarta respuestas de filtros ya cambiados) tal como `ListadoChats`. Barra de filtros: rango, gestión, estado, categoría, buscar contacto. Tabla: Última actividad · Gestión (badge) · Estado · Categoría · Contacto · Consulta (extracto del resumen, link a la ficha). Abre con `gestion` en todas y `estado` en `CAPTADO`, con los selects visibles para ampliar.

**`/board/casos/[id]`** — `FichaCaso.tsx`. Arriba, contacto y categoría con los botones de gestión y un campo de nota interna opcional. Debajo, los datos recabados (el resumen que dejó `registrar-caso`), la línea de tiempo de eventos —los del agente y los humanos en el mismo hilo, que es lo que hace legible por qué un caso está como está— y "Ver la conversación" hacia `/board/chats/<conversationId>`.

El transcript no se duplica acá: leer la conversación es el trabajo de la sección Chats, y embeberlo obligaría a mantener dos renders del mismo timeline.

**Métricas** — la tabla "Casos captados" queda igual, con un link "Ver todos" al tab nuevo.

Estilo: CSS module propio siguiendo `chats.module.css`, tokens existentes. Los badges de gestión usan color solo como refuerzo — el texto del estado siempre está.

---

## 5. Errores y bordes

| Situación | Comportamiento |
|---|---|
| Caso inexistente o de sesión de revisión | 404 en GET y en PATCH (el guard está en la query, no en la UI) |
| PATCH sin sesión humana | 401 sin identidad; 403 si la identidad es el runner |
| `gestion` fuera del enum | 400 del `parseRequestBody` con Zod |
| Caso sin contacto (`EN_CONVERSACION`) | Se lista y se gestiona igual; las celdas de contacto muestran "—" |
| `resumen` con shape desconocido | Se muestra "Sin datos recabados", nunca JSON crudo |
| Thread sin mensajes persistidos | `ultimaActividad` cae a `updatedAt` del caso |
| Falla de red en el PATCH | La ficha revierte al estado servido y muestra el error; no hay optimistic update mudo |

---

## 6. Testing

- **Vitest sobre `casos.ts`**: excluye sesiones de revisión, aplica el filtro por defecto, pagina por cursor, y `actualizarGestion` escribe el evento con el estado anterior — más el caso de id inexistente, que no debe dejar evento huérfano.
- **Vitest sobre las tres rutas** (patrón de `metricas/route.test.ts`): 401 sin sesión, 403 para el runner en el PATCH, 404, 200.
- **Test de componente** para `ListadoCasos` (patrón `ListadoChats.test.tsx`): filtros, estado vacío, "Cargar más".
- **E2E** (`tests/board.spec.ts`): navegar al tab, abrir una ficha, cambiar la gestión y ver el cambio reflejado en el listado.

Gate: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` y `pnpm test` del frontend. No toca prompts ni corpus, así que no corresponde `pnpm evals`.

---

## 7. Fuera de alcance

- Asignación de un caso a una persona o a un abogado concreto de la red.
- Notificación por mail cuando entra un caso nuevo.
- Export CSV de la bandeja.
- Cualquier cambio en lo que escriben los agentes (`registrar-caso`, clasificación, corrección).
- Métricas de gestión (tiempo hasta el contacto, tasa de derivación). Los eventos quedan escritos desde el día uno, así que la sección de Métricas se puede alimentar de ellos más adelante sin migración nueva.
