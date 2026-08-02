# Board de administración — diseño

**Fecha**: 2026-08-01
**Estado**: aprobado, pendiente de plan de implementación
**Alcance**: superficie interna del equipo — chats de consultantes reales, métricas de uso y el sistema de revisión, todo detrás de auth por email autorizado.

---

## 1. Problema y objetivo

Hoy el sistema no tiene ninguna superficie donde el equipo observe qué está pasando. Lo único que existe es `/revision` (`docs/plans/2026-07-20-sistema-revision-feedback-legal.md`): un espacio para que el equipo legal cree conversaciones de prueba y las anote. No hay forma de ver las conversaciones reales de los consultantes, ni de saber si el funnel de captación funciona, ni cuánto cuesta operarlo.

El objetivo es un **board interno único** que responda tres preguntas:

1. **¿Qué está pasando en las conversaciones reales?** — leerlas, buscarlas, y anotar las que fallan.
2. **¿El sistema cumple su función?** — el funnel escuchar → evacuar dudas → captar caso, medido (`docs/vision-producto.md`).
3. **¿Qué falta y qué cuesta?** — demanda fuera de cobertura, costo y performance del agente.

Y que **la revisión viva adentro** de ese board, no como una isla con su propia puerta.

### Por qué ahora

El loop de mejora del proyecto (skill `revisar-feedback-legal`: nota → diagnóstico → fix → eval anti-regresión) hoy solo se alimenta de conversaciones de prueba, que el equipo legal inventa. Las fallas reales de producción no entran a ese loop porque nadie las ve. El board cierra ese circuito.

---

## 2. Decisiones tomadas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Ubicación | Rutas `/board/*` dentro de `frontend/` | App standalone / repo separado (duplicaría `lib/revision/` y el schema Prisma) |
| Roles | Uno solo: quien está en la allowlist ve todo | Roles admin/experto (complejidad sin necesidad hoy) |
| Métricas | Las cuatro familias: funnel, demanda, costo/performance, volumen | Subconjunto |
| Chats reales | Ver **y anotar** | Solo lectura / con takeover humano |
| Bandeja de casos | Fuera de alcance | Bandeja con flujo de derivación |
| Estética | Tokens Jurco existentes, tema claro | Dashboard oscuro / doble tema |
| Auth | NextAuth v5 + Resend magic link + `ALLOWED_EMAILS` | Clave compartida (lo actual), OAuth |

El método de auth replica el del proyecto `~/observability`, con los desvíos documentados en §3.2.

---

## 3. Arquitectura

### 3.1 Ubicación y estructura

```
frontend/src/
├─ auth.ts                          NextAuth({ PrismaAdapter, Resend, signIn: isAllowed })
├─ auth.config.ts                   edge-safe: pages, sesión JWT, callbacks jwt/session
├─ proxy.ts                         gate de /board/* y /api/board/* (ver §3.2)
├─ app/
│  ├─ login/page.tsx                form de email
│  ├─ login/check-email/page.tsx    confirmación "revisá tu correo"
│  ├─ api/auth/[...nextauth]/route.ts
│  ├─ api/board/
│  │  ├─ metricas/route.ts          agregados de las 4 familias, por rango
│  │  ├─ conversaciones/route.ts    listado paginado + filtros + búsqueda
│  │  ├─ conversaciones/[id]/route.ts  detalle: timeline + caso + notas
│  │  └─ conversaciones/[id]/notas/route.ts  crear nota sobre un chat real
│  ├─ board/
│  │  ├─ layout.tsx                 server component: auth() + sidebar
│  │  ├─ page.tsx                   métricas (sección por defecto)
│  │  ├─ chats/page.tsx             listado
│  │  ├─ chats/[id]/page.tsx        detalle
│  │  └─ revision/…                 lo que hoy vive en /revision
│  └─ revision/page.tsx             → redirect a /board/revision
├─ lib/board/
│  ├─ identidad.ts                  getIdentidadBoard() — las dos credenciales
│  ├─ scope.ts                      exclusión de sesiones de revisión (§4.1)
│  ├─ metricas.ts                   agregaciones
│  ├─ conversaciones.ts             listado y detalle
│  └─ costos.ts                     tabla de precios por modelo
└─ components/board/                sidebar, tarjetas de KPI, gráficos, tabla de chats
```

`lib/revision/*` **no se modifica**: `timeline.ts`, `notas.ts`, `sesiones.ts`, `exportar-markdown.ts` y `seleccion.ts` siguen igual. Solo cambia quién los invoca y cómo se autentica esa invocación.

### 3.2 Auth — el patrón de observability con tres desvíos

Base común con `~/observability`: **NextAuth v5** (`next-auth@5.0.0-beta.32`), provider **Resend** (magic link), sesión **JWT**, allowlist `ALLOWED_EMAILS` verificada en el callback `signIn`, páginas `/login` y `/login/check-email`.

**Desvío 1 — adapter Prisma, no `@auth/pg-adapter`.**
Observability corre un `Pool` crudo sobre un schema `observability` creado con SQL a mano. Acá Prisma es dueño del schema y las migraciones. Meter tablas fuera de su control re-crearía un gotcha ya documentado en `CLAUDE.md`: cuando aparecen tablas ajenas en `public`, `prisma migrate dev` las detecta como drift y propone resetear la base. Los modelos de Auth.js (`User`, `Account`, `Session`, `VerificationToken`) van a `schema.prisma` y salen por migración normal.

**Desvío 2 — `src/proxy.ts`, no `src/middleware.ts`.**
Next 16 renombró el archivo de middleware (`PROXY_FILENAME = 'proxy'` en `next/dist/lib/constants.js`; la guía de arquitectura §3.4 ya lo anticipaba). Un `middleware.ts` copiado de observability **no se ejecutaría, y no fallaría**: el board quedaría sin protección de forma silenciosa.

**Desvío 3 — matcher inverso.**
En observability *todo* es privado. Acá el producto es público y tiene que seguir siéndolo. El matcher cubre exclusivamente `/board/*` y `/api/board/*`; quedan intactos `/`, `/api/chat/*` y `/api/health`.

**`/api/revision/*` queda fuera del matcher, deliberadamente.** Dos razones: (a) `POST /api/revision/acceso` es el endpoint de login del runner — si el proxy exigiera sesión ahí, el runner nunca podría autenticarse; (b) la credencial del runner es un HMAC verificado con `node:crypto`, que no existe en el runtime Edge donde corre el proxy. Esas rutas quedan protegidas a nivel handler por `getIdentidadBoard()` (§3.3), que es estrictamente más capaz que el proxy porque entiende las dos credenciales. La protección no se debilita: se mueve a la única capa que puede evaluarla completa.

**Defensa en profundidad**: el proxy es un filtro grueso. Cada page y cada route handler del board repite el chequeo con `auth()` server-side, según la guía de arquitectura §3.1 y §3.4. Un fallo del matcher no debe alcanzar para exponer datos.

**Sesión**: JWT, 7 días. La guía de codificación frontend §10 menciona 30 días con refresh diario para el login de usuario final; ésta es una superficie de administración y usa una ventana más corta.

**Fail-closed**: `isAllowed` con `ALLOWED_EMAILS` vacío o ausente deniega todo (idéntico a observability). Además, el módulo loguea un warning al arrancar si la lista está vacía, para que una env faltante en producción se detecte por log y no por un login que rebota sin explicación.

### 3.3 Doble credencial en `/api/revision/*`

El runner `pnpm escenario` (skill `reproducir-escenario`) se autentica hoy contra `POST /api/revision/acceso` con `REVISION_CLAVE` y opera con la cookie firmada `ls_experto`. Es un cliente máquina: no puede completar un magic link.

Se introduce un resolvedor único de identidad:

```ts
// lib/board/identidad.ts
export interface IdentidadBoard {
  nombre: string;
  tipo: "humano" | "runner";
}

export async function getIdentidadBoard(): Promise<IdentidadBoard | null>;
//   sesión Auth.js válida        → { nombre: session.user.name ?? email, tipo: "humano" }
//   cookie ls_experto válida     → { nombre, tipo: "runner" }
//   ninguna                      → null
```

Los handlers de `/api/revision/*` pasan de `getExperto()` a `getIdentidadBoard()`. Consecuencias:

- `REVISION_CLAVE` **sobrevive**, con el rol redefinido: credencial de servicio del runner, ya no una clave que un humano tipea en un browser.
- `AccesoForm` se elimina y `POST /api/revision/acceso` queda como endpoint exclusivo de máquina.
- `NotaRevision.autor` se llena con el nombre de la sesión en vez del nombre tipeado. Es un `String` libre: **no hay migración de datos** y las notas históricas quedan como están.
- Las rutas `/api/revision/*` **no cambian de path**, así el runner sigue apuntando donde apunta hoy sin tocar `scripts/escenario.ts`.

### 3.4 Dependencias nuevas

| Paquete | Versión | Nota de compatibilidad (verificada) |
|---|---|---|
| `next-auth` | `^5.0.0-beta.32` | peer `next: ^16.0.0` — soporta Next 16 |
| `@auth/prisma-adapter` | `^2.11.3` | peer `@prisma/client: >=6` |
| `resend` | `^6.18.1` | — |
| `recharts` | `^3.10.1` | recharts declara peer React `^19` recién desde 2.15.0; se elige la v3 por ser la línea actual, no porque la 2.x sea incompatible |

Recharts entra únicamente en el bundle de `/board`, que Next code-splitea por ruta; el chat público no lo carga.

### 3.5 Variables de entorno

| Variable | Uso |
|---|---|
| `AUTH_SECRET` | Firma del JWT de sesión (`npx auth secret`) |
| `ALLOWED_EMAILS` | Allowlist separada por comas |
| `RESEND_API_KEY` | Envío del magic link — **se reusa la cuenta de Resend de `~/observability`**, ya verificada |
| `EMAIL_FROM` | Mismo dominio verificado que observability, con display name propio: `Jurco <no-reply@…>` |
| `REVISION_CLAVE` | *(existente, rol redefinido)* credencial de servicio del runner |

**Branding del email**: el `mailer.ts` de observability trae el HTML con la identidad de Colar (tema oscuro, botón índigo, encabezado "Colar Observability"). El del board se escribe con la identidad Jurco — navy `#132a3b` y acento `#3185c9` sobre fondo claro, encabezado "Jurco". Un magic link que llega firmado como otro producto le da al equipo legal una razón razonable para no hacer click.

---

## 4. Métricas

### 4.1 Invariante: excluir sesiones de revisión

**Ninguna métrica de negocio cuenta conversaciones de revisión.** El modelo ya lo previó — el comentario de `Conversation.esRevision` en `schema.prisma` lo dice literal: *"Los Caso de estas conversaciones se EXCLUYEN de toda métrica de negocio (join por este flag)."*

Las tablas de Mastra viven en el schema `mastra` y no conocen ese flag, así que las queries crudas joinean explícitamente:

```sql
FROM mastra.mastra_ai_spans s
JOIN public."Conversation" c ON c."threadId" = s."threadId"
WHERE c."esRevision" = false
```

Sin ese join, las corridas de `pnpm escenario` y las pruebas del equipo legal inflarían el funnel y el costo reportado. Es el error más fácil de cometer en este spec, así que la condición vive en un helper único (`lib/board/scope.ts`) que **todas** las queries consumen, y tiene un test dedicado (§6).

**Índice requerido**: hoy `Conversation` solo tiene los `@unique` de `sessionId` y `threadId`. Todas las queries del board filtran por `esRevision` y ordenan por fecha, así que la migración agrega `@@index([esRevision, createdAt(sort: Desc)])`, que sirve tanto al listado de chats como a las series temporales.

### 4.2 Funnel de captación

Prisma sobre `Conversation` + `Caso`. Cinco etapas, con tasa de conversión entre etapas y serie diaria:

| Etapa | Condición |
|---|---|
| Iniciadas | `Conversation` con `esRevision = false` |
| Clasificadas | `categoria != null` |
| Con caso | existe `Caso` asociado |
| Captadas | `Caso.estado = CAPTADO` |
| Fuera de cobertura | `Caso.estado = FUERA_DE_COBERTURA` |

Transiciones verificadas en `lib/clasificacion.ts`: `CAPTADO` se dispara cuando llega **cualquier** dato de contacto (línea ~202); `FUERA_DE_COBERTURA` se fija en la clasificación cuando el receptor detecta un escape (líneas ~67-68).

### 4.3 Demanda por categoría

- Conversaciones por `Conversation.categoria`.
- Subcategorías por `unnest(Caso.subcategorias)`.
- **Fuera de cobertura, listado con su `resumen`** — no solo contado. Es la lista concreta de qué piden los consultantes que el sistema todavía no cubre, y alimenta directamente el roadmap de `docs/dominio-consultas.md`. Un número agregado no sirve para decidir qué categoría habilitar; el texto de los briefs sí.

### 4.4 Costo y performance del agente

`$queryRaw` sobre `mastra.mastra_ai_spans`. Los `spanType` reales que escribe el `MastraStorageExporter` son `agent_run`, `tool_call` y `model_generation` (verificado en `lib/revision/timeline.ts`).

- **Tokens** por modelo, desde `attributes->'usage'` (`inputTokens` / `outputTokens`).
- **Latencia por turno**: `endedAt - startedAt` de los spans `agent_run`.
- **Uso de tools**: frecuencia por `tool_call`, con foco en la proporción de turnos que pasan por `buscar-documentos` — es un proxy directo del cumplimiento de la regla anti-fabricación (`CLAUDE.md`: toda afirmación normativa se funda en lo que devolvió la tool).
- **Costo estimado**: tabla de precios por modelo en `lib/board/costos.ts`, con la fecha de la tabla en un comentario. Un modelo desconocido devuelve `null`, **no `0`** — así un cambio de modelo se ve como "sin dato" en vez de reportar costo cero en silencio.

### 4.5 Volumen y engagement

Sobre `mastra.mastra_messages` + `Conversation`: conversaciones por día, mensajes por conversación (promedio y distribución), tasa de abandono (conversaciones con un único mensaje de usuario) y distribución horaria.

### 4.6 Rango temporal

Selector global — 7d / 30d / 90d / todo — aplicado a las cuatro familias. Viaja como query param al endpoint de métricas y se refleja en la URL.

---

## 5. Secciones del board

### 5.1 Métricas (`/board`)

Sección por defecto. Tarjetas de KPI arriba (conversaciones, tasa de captación, costo del período), gráficos de las cuatro familias abajo. Un solo fetch a `/api/board/metricas?rango=…`, cacheado con SWR; el handler corre las agregaciones de las cuatro familias **en paralelo** (`Promise.all`) y devuelve un payload validado con Zod, para que la latencia sea la de la query más lenta y no la suma.

### 5.2 Chats (`/board/chats`)

**Listado**: fecha, categoría, estado del caso, cantidad de mensajes, preview del primer mensaje del consultante, indicador de notas. Filtros por categoría, estado y rango. Paginado por cursor sobre `createdAt`.

**Búsqueda**: `ILIKE` sobre el texto de `mastra.mastra_messages`, limitada al rango seleccionado. Es suficiente para el volumen actual y evita introducir full-text search antes de necesitarlo; si el volumen lo pide, la evolución natural es un índice GIN con `to_tsvector`, y queda anotada acá para no re-decidirlo desde cero.

**Detalle** (`/board/chats/[id]`): reusa `construirTimeline(threadId, { conSpans: true })` — la misma vista que ya usa revisión, incluida la atribución de tool-calls al agente subiendo por `parentSpanId` (Mastra no puebla `parentEntityName` en `tool_call`; el workaround ya está resuelto en `timeline.ts`). Al costado, el `Caso` (contacto, subcategorías, resumen) y el hilo de notas.

**Anotar**: los componentes `NotaComposer` y `NotaThread` se reusan sin cambios, y `listarNotasDeSesion()` ya lee notas de cualquier conversación. Pero **dos guards deliberados hay que abrir explícitamente** — descubiertos al planificar, corrigen la suposición inicial de que "todo funcionaba sin cambios":

1. **`crearNota()` rechaza conversaciones reales.** Tiene un chequeo `esRevision: true` con el comentario *"ninguna nota puede colgarse de una conversación real de consultante, venga de la ruta o de un script"*. Era correcto cuando el único anotador era el equipo legal sobre sesiones de prueba; el board le da a esa operación un caso de uso legítimo por primera vez. Se abre con un parámetro explícito `alcance: "revision" | "chat-real"` que **default a `"revision"`**: los seis call sites existentes no cambian de comportamiento y el board declara su intención en el único lugar donde hace falta. No se borra el guard — se le agrega una puerta con nombre.

2. **`scripts/feedback-pull.ts` filtra `esRevision: true`.** Sin tocarlo, una nota sobre un chat real nunca llegaría al equipo dev y el loop nota → fix → eval quedaría cortado justo para las fallas de producción, que es lo que el board viene a habilitar. El script pasa a traer ambos orígenes, marcando cuál es cuál en el export.

Las notas sobre chats reales entran por una ruta propia del board (`/api/board/conversaciones/[id]/notas`), y las rutas que operan **por sesión** (`/api/revision/sesiones/*`) siguen exigiendo `esRevision: true` vía `getSesionRevision()`.

**Matiz encontrado en el review final:** las dos rutas que operan **por nota** (`/api/revision/notas/[notaId]` y `.../respuestas`) resuelven la nota por su id y nunca pasaron por `getSesionRevision()`. Era inocuo mientras toda nota colgaba de una sesión de revisión; ahora existe una segunda población. Un portador de `REVISION_CLAVE` —credencial de servicio, no de la allowlist— podría marcar como `RESUELTA` una nota sobre una conversación real y esconderla de `feedback:pull`. Requiere adivinar un cuid, así que es defensa en profundidad y no una puerta abierta; queda como follow-up, no como bloqueante.

### 5.3 Revisión (`/board/revision`)

Se muda tal cual desde `/revision`. Único cambio funcional: el acceso es la sesión del board en vez de la clave tipeada.

### 5.4 Estética

Consume los tokens de `app/globals.css` (navy `#132a3b` + acento acero `#3185c9` sobre blancos fríos, Poppins/Open Sans, radios casi rectos). Sin design system nuevo y sin duplicación de tokens: la revisión vive adentro del board y ya los usa. Layout de dashboard: sidebar fijo + área de contenido. CSS Modules, como el resto del frontend.

---

## 6. Testing

### Unit (vitest, `pnpm test:unit`)

- `lib/board/identidad.ts` — las tres resoluciones: sesión Auth.js, cookie del runner, ninguna.
- `lib/board/scope.ts` + `metricas.ts` — cada agregación con datos sembrados, **incluyendo un caso donde existen conversaciones con `esRevision = true` que no deben contarse**. Es el test que protege el invariante de §4.1.
- `lib/board/costos.ts` — modelo conocido devuelve costo; modelo desconocido devuelve `null`.
- `isAllowed` — allowlist vacía deniega todo, comparación case-insensitive, tolera espacios alrededor de las comas.

### E2E (playwright, `pnpm test`)

- **`/` y `/api/chat/stream` siguen públicos** tras introducir el proxy. Es el test más importante del spec: todo el producto pasa por ahí.
- `/board` sin sesión redirige a `/login`.
- `/api/board/*` sin sesión responde 401.
- Con sesión, el board carga y lista conversaciones.

### Adaptaciones

Los `route.test.ts` existentes de `/api/revision/*` (`acceso`, `sesiones`, `sesiones/[id]`) se adaptan al resolvedor de identidad nuevo, cubriendo ambas credenciales.

---

## 7. Migración y despliegue

Orden obligatorio — el paso 3 antes del 4:

1. Migración Prisma con los modelos de Auth.js.
2. Env nuevas en `.env.example` y en Railway: `AUTH_SECRET`, `ALLOWED_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`.
3. **Sumar al equipo legal a `ALLOWED_EMAILS` y verificar que entran.**
4. Recién entonces: redirect de `/revision` → `/board/revision` y eliminación de `AccesoForm`.
5. `REVISION_CLAVE` se mantiene en Railway, con su rol redefinido a credencial de servicio.
6. Documentación: `CLAUDE.md` (comandos y reglas), `docs/guia-arquitectura.md` §3.4 (ahora conviven dos identidades: cookie anónima del consultante y sesión del board), `docs/guia-codificacion-frontend.md` §10 (deja de ser "fase posterior").

---

## 8. Riesgos

| Riesgo | Gravedad | Mitigación |
|---|---|---|
| El proxy rompe el chat público | Alta — tumba el producto entero | Matcher acotado a `/board/*`, `/api/board/*`, `/api/revision/*` + E2E que verifica `/` y `/api/chat/stream` públicos |
| Auth.js v5 sigue en beta sobre Next 16 | Alta — bloquea todo lo demás | El peer declara `^16.0.0`, pero la **primera tarea del plan** es login andando punta a punta, antes de escribir una sola métrica: si hay fricción aparece cuando cambiar de enfoque todavía es barato |
| Equipo legal bloqueado al desplegar | Media — corta un proceso con personas reales | Orden de migración §7: allowlist y verificación antes del redirect |
| Tabla de precios desactualizada | Baja | Fecha en comentario; modelo desconocido → `null`, nunca `0` |
| Volumen de `mastra_ai_spans` | Baja hoy, crece | Agregaciones siempre acotadas por rango, índice sobre `("threadId")` si no existe, SWR con deduping. Sin pre-agregación hasta tener evidencia de que hace falta |

---

## 9. Fuera de alcance

- **Bandeja de casos** con flujo de derivación y estado `DERIVADO`. El `Caso` se ve en el detalle de cada conversación y agregado en el funnel, pero no hay superficie operativa para trabajarlo. Sale como spec propio cuando exista el proceso humano de derivación.
- **Takeover humano** de una conversación en curso.
- **Roles diferenciados** (admin vs experto legal).
- **Exportación** de métricas o casos a CSV.

---

## 10. Referencias

- `docs/vision-producto.md` — el funnel que las métricas miden.
- `docs/plans/2026-07-20-sistema-revision-feedback-legal.md` — el sistema de revisión que se muda al board.
- `docs/plans/2026-07-22-sistema-escenarios-reproducibles.md` — el runner que motiva la doble credencial.
- `docs/guia-arquitectura.md` §3 — capas del frontend, BFF, identidad.
- `docs/guia-codificacion-frontend.md` §10 — patrón de Auth.js documentado para esta fase.
- `~/observability` — implementación de referencia del método de auth.
