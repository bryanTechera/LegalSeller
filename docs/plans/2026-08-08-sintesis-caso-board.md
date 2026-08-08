# Síntesis del caso como pieza central del board — diseño

**Fecha**: 2026-08-08
**Estado**: implementado
**Alcance**: un resumen generado con IA por cada `Caso`, una vista "ver caso" en el board que lo pone al centro, y notas del equipo legal ancladas al caso. Fuera: cambiar cómo el agente conversa o capta (§10).

---

## 1. Problema y objetivo

Hoy el board le muestra al equipo legal dos cosas distintas y desparejas.

En **Pedidos fuera de cobertura** (`MetricasPanel.tsx:232-245`) cada fila trae un resumen en prosa: es el `brief` que el receptor escribió al clasificar, guardado en `Caso.resumen.brief`. Se lee de un vistazo y alcanza para decidir si el pedido interesa.

En **Casos captados** (`MetricasPanel.tsx:123-167`) cada fila trae nombre, teléfono, mail y un link "Ver chat". Nada del caso. Para saber de qué se trata hay que abrir el transcript completo y leerlo entero — y el transcript es la conversación de venta, no un legajo: la información que un abogado necesita está dispersa entre veinte mensajes, mezclada con la parte de la charla que existe para generar confianza.

O sea: el lead —el entregable del sistema— es lo único que llega sin resumir.

**Objetivo**: que cada caso tenga un resumen generado con IA con toda la información relevante que el consultante fue dando, y que ese resumen sea la pieza central de una vista propia. El chat pasa a ser lo que el equipo legal consulta para **verificar** un dato puntual, no para enterarse de qué se trata el caso.

Lo que hoy hace el `brief` del receptor no alcanza para eso: se escribe **una sola vez**, en el primer turno, antes de que el especialista releve nada. Todo lo que el consultante cuenta después —antigüedad, salario, fechas, qué le pagaron, qué documentación tiene— no vuelve a resumirse en ningún lado. Sí se acumula `resumen.hechos` (append de los `hechos` que manda `registrar-caso`), pero eso es un pegoteo de fragmentos escritos por el agente para sí mismo, no un texto redactado para un abogado.

---

## 2. Decisiones tomadas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Cuándo se genera | **Al captar, y refresco perezoso cuando quedó vieja**: se genera cuando el caso pasa a `CAPTADO`, y al abrir la vista se regenera solo si el material cambió | Tras cada turno (una llamada de modelo por turno de toda conversación con caso, la mire alguien o no); solo on-demand (no existe para listados ni exports) |
| Forma | **Prosa + datos para dimensionar**: párrafo de situación, hechos con fechas, datos clave etiquetados, qué pidió el consultante, qué falta averiguar | Prosa corrida sola (no se escanea, no se exporta por campo); ficha estricta por categoría (un schema por categoría, se rompe cuando el caso no encaja) |
| Dónde vive | **Tabla propia `SintesisCaso`**, 1:1 con `Caso` | Columnas en `Caso` (mueven su `updatedAt`, que es el orden del listado de captados — §5.2) |
| Notas del equipo legal | **Entidad nueva `NotaCaso`**, append-only | Reusar `NotaRevision` (la levantaría `feedback:pull` como si fuera feedback pendiente para el equipo dev) |
| Quién llama al modelo | **El backend Mastra**, por un apiRoute custom | El BFF directo (el frontend no tiene AI SDK; duplicaría gateway, catálogo de modelos y logger) |
| Alcance | **Todo `Caso`**, cualquier estado y también los fuera de cobertura | Solo `CAPTADO` (deja los pedidos fuera de cobertura como una línea suelta sin forma de profundizar) |
| Ruta | **`/board/casos/[id]` propia**, con enlace al chat | Rearmar `/board/chats/[id]` (mezcla la audiencia legal con el diagnóstico técnico y no resuelve la conversación con dos casos) |

### La síntesis no reemplaza al `resumen` crudo

`Caso.resumen` (`{ brief, hechos, temaDetectado }`) queda **intacto y con su función actual**: es materia prima escrita por los agentes, y `brief` además se re-inyecta al especialista en cada turno (`readOnly.casoBrief`) para que no re-pregunte. La síntesis es una pieza **derivada**, para consumo humano, regenerable y descartable. Confundirlas llevaría a que un cambio de prompt de la vista rompa el contexto que recibe el agente.

---

## 3. Modelo de datos

Migración aditiva `sintesis_y_notas_de_caso`. No toca ninguna columna existente, así que es segura sobre la base compartida entre worktrees.

```prisma
/// Resumen del caso generado con IA sobre el transcript — la pieza que el
/// equipo legal lee primero. Tabla propia y no columnas en `Caso` por dos
/// razones: guardar la síntesis no debe mover `Caso.updatedAt` (es el orden
/// del listado de captados y entraría en el cálculo de su propia huella), y
/// el ciclo de vida es distinto — la síntesis se regenera y se descarta, el
/// caso no.
model SintesisCaso {
  id     String @id @default(cuid())
  casoId String @unique
  /// Contenido validado con `sintesisSchema` (situacion, hechos, datosClave,
  /// pedido, faltantes). Json y no columnas: la forma la fija el schema Zod
  /// compartido, que es donde tiene que estar la verdad.
  contenido Json
  /// Huella del material resumido — transcript + campos del caso + versión de
  /// prompt y modelo. Igual = la síntesis sigue vigente (§5).
  huella     String
  modelo     String
  generadaEn DateTime @default(now())
  updatedAt  DateTime @updatedAt

  caso Caso @relation(fields: [casoId], references: [id], onDelete: Cascade)
}

/// Nota del equipo legal sobre el caso: información que consiguió por fuera
/// del chat, típicamente hablando con el cliente. Append-only, con autor y
/// fecha. NO es `NotaRevision`: aquello es feedback dirigido al equipo dev y
/// `feedback:pull` levanta toda nota ABIERTA — estas notas no son un pedido
/// de arreglo y no deben entrar a ese circuito.
model NotaCaso {
  id     String @id @default(cuid())
  casoId String
  /// Email de la sesión del board. Nunca viene del body.
  autor     String
  texto     String
  createdAt DateTime @default(now())

  caso Caso @relation(fields: [casoId], references: [id], onDelete: Cascade)

  @@index([casoId, createdAt])
}
```

En `Caso` se agregan solo las dos relaciones inversas (`sintesis SintesisCaso?`, `notas NotaCaso[]`).

---

## 4. Generación de la síntesis

### 4.1 Contrato

Schema Zod, en el backend, para pedirle la forma al modelo y validar lo que devuelve:

```typescript
export const sintesisSchema = z.object({
  situacion: z.string(),                                    // un párrafo en prosa
  hechos: z.array(z.object({ cuando: z.string().nullable(), que: z.string() })),
  datosClave: z.array(z.object({ etiqueta: z.string(), valor: z.string() })),
  pedido: z.string(),                                       // qué vino a resolver
  faltantes: z.array(z.string()),                           // qué haría falta preguntar
});
```

`datosClave` es una lista de pares y no campos fijos precisamente porque los datos que dimensionan un caso cambian por categoría: en despido son antigüedad, salario y forma; en desalojo son el régimen del contrato y la fecha de la intimación. La etiqueta la elige el modelo a partir de lo que el consultante contó.

`cuando` acepta ausencia: el modelo debe poder decir "no dijo cuándo" sin inventar una fecha. La familia GPT manda `null` explícito y la familia Gemini omite la clave — el schema acepta ambas (mismo gotcha que costó 25 `registrar-caso` en producción, ver CLAUDE.md).

**El schema vive dos veces, a propósito.** `backend/` y `frontend/` son paquetes pnpm separados, sin workspace que los una: el frontend no puede importar del backend. El BFF lleva su propio schema espejo para validar la respuesta HTTP, exactamente como `chat-orchestrator-schemas.ts` ya valida los args de tools que se definen en el backend. La regla que evita que se desincronicen es la misma que ahí: el espejo es **tolerante en los opcionales y estricto en la forma**, y un cambio de campo toca los dos archivos en el mismo commit.

### 4.2 Modelo y prompt

Rol nuevo en `backend/src/mastra/config/modelos.ts`:

```typescript
export const MODELO_SINTESIS = "google/gemini-3.5-flash-lite";
```

El criterio del rol es fidelidad sobre texto ya dado, no razonamiento: el material entero viaja en el prompt y la tarea es reorganizarlo. Corre fuera del camino del chat, así que su latencia no la percibe ningún consultante. Va también a `frontend/src/lib/board/costos.ts` — un modelo ausente de esa tabla deja el costo del board en "sin dato".

El prompt (`backend/src/mastra/sintesis/prompt.ts`) sigue las rules de contenido inyectado del proyecto: español rioplatense, tags XML en español, sin emojis, sin la palabra "skill". Su nota crítica es la anti-fabricación, y acá tiene una vuelta propia respecto de los agentes: el oráculo no es `buscar-documentos` sino **el propio transcript**. Todo lo que la síntesis afirme tiene que estar dicho en la conversación; lo que no está, va a `faltantes`. Un dato inventado en esta pieza es peor que en una respuesta al consultante, porque un abogado lo va a tomar como relevado.

El prompt lleva una constante `PROMPT_VERSION` que entra en la huella: cambiarlo marca stale a todas las síntesis, igual que `PIPELINE_VERSION` con el corpus.

Un detalle que el prompt tiene que decir explícito: **una conversación puede contener varios casos**. El material trae el transcript completo del thread, y la síntesis es de *un* caso — el prompt recibe la categoría y las subcategorías de ese caso y debe ceñirse a lo que corresponde a ese asunto.

### 4.3 Endpoint

`POST /sintesis-caso` en `server.apiRoutes` de `backend/src/mastra/index.ts`. Fuera del prefijo `/api`, que Mastra rechaza al boot para rutas custom (gotcha conocido, mismo motivo que `GET /dominios`).

Recibe `{ caso: { categoria, subcategorias, estado, resumen }, mensajes: [{ rol, texto }] }`, valida con Zod, corre `generateObject` contra `MODELO_SINTESIS` y devuelve `{ status: "ok", sintesis } | { status: "error", mensaje }`. Nunca 500 con stack: el error viaja como valor, igual que en las tools de agente.

Del lado del BFF, `frontend/src/lib/agent-service.ts` gana `pedirSintesis(material)` — sigue siendo el único módulo que conoce `MASTRA_BASE_URL`. Se llama distinto que la función del backend (`generarSintesis`) a propósito: una pide, la otra genera, y el nombre dice de qué lado del cable está cada una.

---

## 5. Frescura: huella y disparo

### 5.1 La huella

```
huella = sha256(JSON estable de {
  promptVersion, modelo,
  mensajes: { cantidad, ultimoId, ultimaFecha },
  caso: { categoria, subcategorias ordenadas, resumen, contactoNombre,
          contactoTelefono, contactoEmail, estado },
})
```

Todo lo que entra es **contenido**. Deliberadamente **no** entra `Caso.updatedAt`: escribir la síntesis toca la fila del caso en algunas de las rutas que la rodean, y una huella que depende de un timestamp que la propia escritura mueve regenera en cada apertura para siempre.

Tampoco entran las `NotaCaso`. Las notas son del equipo legal y viven en su propia sección de la vista; mezclarlas en un texto generado por IA borra la procedencia — quien lee no puede distinguir lo que dijo el cliente en el chat de lo que anotó un abogado después.

### 5.2 El disparo

Un solo punto de entrada, idempotente:

```typescript
asegurarSintesis(casoId, { forzar?: boolean }): Promise<ResultadoSintesis>
```

Lee el caso y su transcript, calcula la huella, y si coincide con la guardada devuelve la que hay. Si no —o si `forzar`— llama al backend, valida, persiste (upsert por `casoId`) y devuelve la nueva.

Se lo llama desde tres lugares, todos sobre esa misma función:

1. **Al captar** — el orquestador, cuando `registrarDatosCaso` dejó el caso en `CAPTADO`, encola la generación *después* de cerrar el stream SSE, sin await y sin bloquear la respuesta al consultante. Un fallo acá no rompe nada: la vista lo va a regenerar.
2. **Al abrir la vista** — `obtenerCaso` la llama y espera. En el caso normal la huella coincide y no hay llamada de modelo.
3. **Botón "regenerar"** — `forzar: true`, para cuando un abogado quiere la síntesis al día tras un turno nuevo.

El servicio Mastra corre como proceso largo en Railway, así que el fire-and-forget del punto 1 sobrevive al cierre del request. Aun así la vista nunca confía en él: es una optimización de latencia percibida, no la fuente de verdad.

---

## 6. Notas del caso

`crearNotaCaso({ casoId, autor, texto })` y `listarNotasCaso(casoId)` en `frontend/src/lib/casos/notas-caso.ts`. El autor sale **siempre** de la sesión del board (`auth()`), nunca del body — mismo criterio que la ruta de notas de conversación, que ya tiene un test dedicado a esa propiedad.

El caso tiene que pasar por `casosReales(null)`: una nota sobre un caso de una sesión de `/revision` o del runner de escenarios no tiene sentido y abriría la vista a datos de prueba.

Append-only: no hay edición ni borrado. Texto validado con Zod (≤4000, igual que `NotaRevision`).

---

## 7. Vista del caso

`/board/casos/[id]` — RSC delgado (`await params`) montando un client component con SWR, exactamente el patrón de `/board/chats/[id]`.

Orden de la página, de arriba abajo:

1. **Encabezado** — categoría y subcategorías, estado, fecha de creación y de última actividad.
2. **El resumen** — es el centro visual de la página: la situación en prosa, después los hechos con sus fechas, los datos clave, el pedido y los faltantes. Al pie, en letra chica, cuándo se generó y el botón "regenerar".
3. **Contacto** — nombre, teléfono y mail, con `mailto:` y `tel:`. Es lo que el equipo legal necesita a mano para llamar.
4. **Notas del equipo legal** — lista con autor y fecha, más el campo para agregar.
5. **Ver chat completo** — enlace a `/board/chats/[conversationId]`, presentado como verificación.

Rutas API, todas con `await auth()` y el mismo 401/500 genérico del resto del board:

| Ruta | Qué hace |
|---|---|
| `GET /api/board/casos/[id]` | Detalle: caso, contacto, fechas, síntesis (asegurada), notas |
| `POST /api/board/casos/[id]/sintesis` | Regenera con `forzar: true` |
| `POST /api/board/casos/[id]/notas` | Crea una nota; autor de la sesión |

### Cambios en `/board`

- **Casos captados**: "Ver chat" pasa a ser **"Ver caso"** apuntando a `/board/casos/${caso.id}`, y cada fila suma dos líneas con la `situacion` de la síntesis. Eso obliga a que `listarCaptados` exponga `caso.id` —hoy solo devuelve `conversationId`— y a que traiga la síntesis por `include`. El listado **no** genera síntesis faltantes: muestra lo que hay y deja el resto en blanco, porque generar hasta cien síntesis dentro de la carga de métricas convertiría el board en un cuello de botella.
- **Pedidos fuera de cobertura**: gana su enlace "Ver caso", que hoy no tiene ninguno pese a que el payload ya trae `conversationId`. Exponer `caso.id` arregla de paso una key duplicada de React: la lista usa `conversationId` como key y una conversación puede tener varios pedidos fuera de cobertura, por diseño.

---

## 8. Errores y degradación

La síntesis es una comodidad, no un requisito de integridad: **ninguna de sus fallas puede impedir ver el caso**.

| Falla | Comportamiento |
|---|---|
| El backend Mastra no responde o devuelve error | La vista muestra el caso completo con el resumen vacío y un aviso de que no se pudo generar, más el botón para reintentar. Si había una síntesis vieja, se muestra esa, marcada como desactualizada. |
| El modelo devuelve algo que no valida contra el schema | Se descarta y se trata como error. Nunca se persiste un contenido no validado. |
| El fire-and-forget del turno falla | Silencioso salvo por el log; la vista regenera al abrir. |
| El caso no existe o es de una sesión de revisión | 404. |

Los logs van por el logger estructurado y nunca incluyen el texto de la conversación ni los datos de contacto.

---

## 9. Testing

**Unit (frontend, vitest)**
- Huella: estable ante reordenamientos irrelevantes; cambia con un mensaje nuevo, con un dato de contacto nuevo y con `PROMPT_VERSION`; **no** cambia por haber guardado la síntesis (el caso de regresión del §5.1).
- `asegurarSintesis`: no llama al backend con huella coincidente; llama y persiste con huella distinta; `forzar` llama siempre; error del backend degrada sin tirar y conserva la síntesis vieja.
- `obtenerCaso`: 404 sobre caso de sesión de revisión; incluye notas ordenadas.
- Notas: el autor sale de la sesión y no del body; texto vacío da 400.
- Rutas: 401 sin sesión, sin tocar la base.

**Unit (backend, vitest)**
- El schema acepta la forma de las dos familias de modelo (`cuando: null` y clave omitida).
- El handler devuelve `{ status: "error" }` en vez de tirar cuando el modelo falla.
- El prompt no contiene la palabra "skill" ni emojis (mismo chequeo que ya corre sobre rules y skills).

**Manual, con la app corriendo**: abrir un caso captado real, verificar el resumen contra el transcript, agregar una nota, regenerar.

No se agrega un eval gated de calidad de la síntesis. Sería un scorer LLM-as-judge, y `eval-design.md` exige calibración humana (κ ≥ 0.6) antes de gatear con uno: el gate saldría rojo por ruido del juez. La verificación de esta pieza es la lectura contra el transcript, que es justamente para lo que queda el enlace al chat.

---

## 10. Fuera de alcance

- Cambiar cómo el agente conversa, capta o clasifica. Ni un prompt de agente de categoría se toca.
- Un listado propio `/board/casos`. Los casos se alcanzan desde métricas y desde el chat.
- Exportar el caso (PDF, mail al abogado). La síntesis queda estructurada justamente para que eso después sea directo.
- Regenerar en masa las síntesis de los casos históricos. Se generan a demanda al abrirlos.
- Que la síntesis alimente al agente. Es una pieza para humanos; el agente sigue con `casoBrief`.
