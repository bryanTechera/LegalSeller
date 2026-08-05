# Casos múltiples por conversación — diseño

**Fecha**: 2026-08-05
**Estado**: aprobado, pendiente de plan de implementación
**Alcance**: modelo de datos (`Caso` 1:N con `Conversation`), orquestación del turno, prompts de las cinco categorías, y el board mostrando los N casos. Métricas del funnel quedan fuera (§7).

---

## 1. Problema y objetivo

Hoy `Caso.conversationId` es `@unique`: **una conversación produce como máximo un caso**. Eso no modela la realidad del producto — una persona que escribe al chat puede traer más de un asunto legal, y cada asunto es un lead derivable distinto, posiblemente a abogados distintos.

El sistema ya reconoce la situación a medias. Las cinco rules `conducta-*` le dicen al agente:

> "Un tema adicional NO es un error de clasificación: registralo como `interesAdicional`."

Y `interesAdicional` termina siendo un string concatenado en `resumen.intereses` del caso único (`frontend/src/lib/clasificacion.ts:197`). Es decir: **el segundo lead se degrada a una nota**. No cuenta como captado, no aparece en la tabla de derivación, no entra al funnel. Un caso derivable que el equipo humano nunca ve.

La visión ya lo modela bien; es la implementación la que tomó un atajo. `docs/vision-producto.md` define el caso como *"una entidad de negocio propia con **referencia a la conversación**"* — referencia, no identidad.

### Evidencia: ya pasó en los datos

La conversación `cmsb6a1420000qo021lb7e31c` (2026-08-01, entorno desplegado) quedó así:

| campo | valor |
|---|---|
| `Caso.categoria` | `laboral` |
| `Caso.subcategorias` | `{desalojo-ley-19889, contrato-de-alquiler}` |
| working memory del thread | describe un caso de arrendamiento (inquilino, LUC) |
| historial de mensajes | describe un despido con certificación de BSE |

Tres versiones distintas de "cuál es la consulta" en una sola fila, y un lead con categoría y subcategorías incoherentes. No es un escenario hipotético: es el estado actual de esa conversación.

### Por qué ahora

El diagnóstico del 2026-08-05 sobre el reuso de thread mostró que este atajo tiene un costo compuesto: la consulta nueva se funde con la vieja, hereda la clasificación equivocada y arranca con la captación apagada (`pedidoContactoHecho` heredado del thread). Modelar el caso como entidad de primera clase arregla los tres a la vez.

---

## 2. Decisiones tomadas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Límite entre un caso y el siguiente | **Cambio de categoría**: un Caso por categoría activa en la conversación | Tool libre del agente (no determinístico); receptor en cada turno (+1 llamada de modelo siempre) |
| Quién detecta el cambio | **El agente marca, el receptor clasifica** (escalamiento en dos pasos) | El agente clasifica solo (clasificar no es su trabajo ni su prompt); clasificador barato por mensaje |
| Contacto entre casos | **Hereda y el Caso nuevo nace `CAPTADO`** | Pedir confirmación por caso (fricción); no heredar (le pide el teléfono a quien acaba de darlo) |
| Vida del thread | **Persistente por diseño**: "Nuevo chat" es la única forma de abrir uno nuevo, y es explícita | TTL por inactividad (descartado: el usuario definió la persistencia como comportamiento deseado) |
| Alcance del spec | Núcleo + board | Solo núcleo (los leads nuevos quedarían invisibles); + métricas del funnel (§7) |

### Consecuencia de "el receptor clasifica"

El agente solo **dispara**; el receptor **decide**. Eso da una propiedad de seguridad que conviene explicitar: si el agente marca por error un tema que en realidad es de su propia área, el receptor lo clasifica en la misma categoría, no se abre ningún caso y el puntero no se mueve. **Un falso positivo del agente es inofensivo.** El costo de un falso positivo es una llamada al receptor; el de un falso negativo, un lead perdido. La asimetría favorece marcar de más, y el prompt debe reflejarlo.

---

## 3. Modelo de datos

```prisma
model Conversation {
  // ...
  casoActivoId String?                   // puntero al Caso que atiende el turno
  categoria    String?                   // deja de ser ruteo; queda como denormalización
  // correccionAplicada se muda a Caso
  casos        Caso[]
}

model Caso {
  conversationId     String              // ya NO @unique
  categoria          String?
  correccionAplicada Boolean @default(false)
  // ...
  @@unique([conversationId, categoria])
  @@index([conversationId])
}
```

`casoActivoId` va como **escalar suelto, sin relación Prisma**. Modelarlo como relación obligaría a nombrar las dos relaciones entre `Conversation` y `Caso` (`@relation("casos")` y `@relation("casoActivo")`), porque Prisma no puede desambiguar dos relaciones entre los mismos modelos — complejidad de schema a cambio de nada, ya que el caso activo siempre está dentro de `casos` y se resuelve en memoria.

`@@unique([conversationId, categoria])` no es cosmético: **hace que la regla elegida sea inviolable desde el código**. Un agente con un bug no puede abrir dos casos laborales en el mismo chat — la base lo rechaza. `registrarDatosCaso` pasa de "buscá el caso o creálo" a un upsert sobre esa clave compuesta.

### Casos fuera de cobertura y el NULL

En Postgres los `NULL` son distintos entre sí, así que el constraint compuesto **no** unifica los casos con `categoria = NULL` (la captación fuera de cobertura, `CasoOrigen.FUERA_DE_COBERTURA`). Eso es deliberado y correcto: **cada demanda no cubierta es una señal de mercado separada**, y fusionar dos temas distintos que el sistema no atiende perdería información que el producto quiere justamente medir.

### `correccionAplicada` se muda a `Caso`

Corregir una mala clasificación inicial sigue teniendo sentido — el receptor puede equivocarse en el turno 1. Lo que deja de tener sentido es que el presupuesto sea **uno por conversación**: con N casos, cada uno merece su propia corrección. La semántica queda limpia: `corregir-clasificacion` corrige el caso activo; `derivar-tema` abre uno nuevo. Dos operaciones distintas que hoy compiten por el mismo mecanismo.

---

## 4. Orquestación

```
orchestrateChatTurn(sessionId, message):

  conversation = getOrCreateConversation(sessionId)
  casoActivo   = conversation.casoActivoId

  ├─ sin caso activo → receptor (como hoy) → crea Caso 1 → apunta → rutea
  │
  └─ con caso activo → agente de casoActivo.categoria
       │
       └─ si el stream trae un tool-call `derivar-tema`:
            (el BFF ya drena el stream completo, incluso si el browser se fue)
            receptor sobre el MISMO mensaje del usuario, memoryReadOnly
              ├─ misma categoría que el caso activo → no-op (falso positivo)
              ├─ categoría ya presente en la conversación → reactiva ese Caso
              ├─ categoría nueva habilitada → crea Caso N (hereda contacto → CAPTADO)
              └─ fuera de cobertura → crea Caso con origen FUERA_DE_COBERTURA
            mueve casoActivoId
            → el turno SIGUIENTE lo atiende el agente nuevo
```

**La reactivación sale gratis.** "Volvamos a lo del divorcio" recorre exactamente el mismo camino: el agente marca, el receptor clasifica en `familia`, esa categoría ya tiene Caso en la conversación, el puntero vuelve ahí y el caso conserva sus hechos acumulados. No hace falta un mecanismo aparte para volver atrás.

**El cambio se aplica al turno siguiente.** El agente que marca da una respuesta puente ("eso es de otra área, seguimos con eso ahora") y el especialista nuevo entra en el próximo mensaje. Es la latencia de un turno que la decisión de §2 ya asumió.

### Tool nueva: `derivar-tema`

```
id:          derivar-tema
disponible:  las cinco categorías
args:        { tema: string }   // el asunto nuevo en las palabras del usuario
retorna:     { status: "ok" | "error", mensaje: string }
```

El agente **no** clasifica: pasa el tema tal como lo escuchó. Clasificar es trabajo del receptor. Como toda tool del proyecto, nunca tira: degradación graceful a `{ status: "error", mensaje }` (regla crítica de `CLAUDE.md`).

---

## 5. Dos simplificaciones que caen solas

**`pedidoContactoHecho` deja de ser una heurística de texto.** Hoy se deriva escaneando los mensajes `assistant` del thread con un matcher léxico (`frontend/src/lib/chat-orchestrator.ts:239-241` + `pedido-contacto.ts`), un parche que existe porque —según su propio comentario— "cuatro iteraciones de prompt mostraron que el agente no asienta su propio estado a tiempo". Con casos de primera clase, el dato pasa a ser un hecho de la base: `casoActivo.estado === "CAPTADO"`. Y como el contacto se hereda, el Caso 2 nace captado y el agente directamente no pide nada.

El módulo `pedido-contacto.ts` **no se borra**: pierde su consumidor en el BFF, pero sigue vivo en `frontend/src/lib/escenarios/expectativas.ts:65` (la expectativa `pedidoContactoUnaVez` del runner de escenarios) y en su espejo `PEDIDO_CONTACTO` de `backend/src/test/run-evals.ts`. Lo único que cambia es su doc-comment, que hoy se atribuye al BFF.

**`interesAdicional` desaparece.** Su razón de ser era no tener dónde poner el segundo tema. Ahora tiene dónde: un Caso. Se elimina del schema de `registrar-caso`, del schema Zod del BFF y de `registrarDatosCaso`.

---

## 6. Prompts

Las cinco rules `conducta-*` (`laboral`, `familia`, `transito`, `arrendamiento-desalojo`, `relaciones-consumo`) llevan hoy esta línea:

> "Si es evidente que la conversación fue mal clasificada (el problema real es de otra área), usá `corregir-clasificacion` (disponible una sola vez). Un tema adicional NO es un error de clasificación: registralo como `interesAdicional`."

Se reemplaza por la distinción entre las dos operaciones, con su motivación (regla de `rules-and-skills-taxonomy.md`: toda directiva lleva su porqué), y sesgada a marcar de más según la asimetría de §2.

La descripción de `corregir-clasificacion` (`backend/src/mastra/tools/clasificacion/corregir-clasificacion-tool.ts:16`) se ajusta al mismo cambio.

**Working memory**: sigue `scope: "thread"` — no hay alternativa, un thread aloja N casos y Mastra no tiene scope por caso. Su template pasa de `# Caso del usuario` en singular a una estructura con los casos en curso, para que el agente que entra a atender el Caso 2 no lea los hechos del Caso 1 como propios.

**Gate**: esto es cambio de contenido de prompt, así que el gate es `pnpm evals`. El test de byte-igualdad de la era de migración que `.claude/rules/prompt-assembly.md` manda eliminar (`src/test/instructions-migracion.test.ts` + su fixture) **ya no existe**: se borró en el commit `5cbe283`. No hay nada que hacer ahí — la nota sobre su ciclo de vida quedó en el JSDoc de los cinco `dominios/*/instructions.ts`.

---

## 7. Board

`listarCaptados` ya lista `Caso` y filtra por `Caso.createdAt` (`frontend/src/lib/board/captados.ts:40` + `scope.ts:21-25`), así que **un caso abierto hoy aparece hoy sin tocar esa query** — el problema de visibilidad que originó la investigación se arregla como efecto lateral de modelar bien.

Cambios necesarios:

- **Detalle del chat** (`obtenerConversacion`): devuelve los N casos en vez de `caso: CasoSnapshot | null`, con cuál es el activo. `getCasoDeSesion` pasa a `getCasosDeSesion`.
- **Listado de chats**: ordenar por última actividad con `MAX(mastra_messages."createdAt")`. Verificado contra la base que `Conversation.updatedAt` **no** se mueve con el `upsert({ update: {} })` — quedó en 2026-08-02 pese a mensajes del 2026-08-05, así que esa columna no sirve como proxy de actividad.
- **Columna de casos** en el listado, para que se vea de un vistazo qué chat produjo más de un lead.

### Fuera de alcance, deliberadamente

**Las métricas del funnel.** `metricas-funnel.ts` compara conversaciones iniciadas contra casos captados; con N casos por conversación esa razón puede pasar de 100% y dejar de leerse como tasa de conversión. Redefinirla es un spec propio: obliga a decidir si la unidad del funnel es la conversación o el caso, y eso cambia todos los KPI del board a la vez. **Mientras tanto el funnel subreporta o exagera según el mix**, y eso hay que avisarlo al equipo antes de mergear.

**La hidratación de la UI del chat.** El estado del chat es React state puro (`useChatStream.ts:31`), así que cada carga de página muestra un chat vacío sobre un thread vivo. Al haber decidido que el thread es persistente por diseño, esta discrepancia **se agrava**: un usuario puede volver con dos casos abiertos y ver una pantalla en blanco. Además, el botón "Nuevo chat" solo se renderiza en la rama no vacía (`ChatPanel.tsx:129`), así que quien vuelve cae justo en la pantalla donde la única salida no existe. Es el siguiente spec en prioridad.

---

## 8. Testing

**Unit** (`frontend/src/lib/`):
- `resolverCasoActivo` y el movimiento del puntero en las cuatro ramas de §4.
- Upsert por `(conversationId, categoria)`: dos `registrar-caso` de la misma categoría no duplican.
- Herencia de contacto: el Caso N nace `CAPTADO` con los datos del Caso 1.
- Falso positivo: `derivar-tema` con la misma categoría es no-op.
- Fuera de cobertura: dos temas no cubiertos producen dos Casos.

**Evals** (`pnpm evals`) — es la parte que puede fallar en silencio:
- `derivar-tema` **dispara** cuando el usuario cambia de área (divorcio → tránsito).
- `derivar-tema` **no dispara** cuando el usuario se mueve dentro de su área (despido → licencias especiales sigue siendo laboral). Este es el caso que importa: un agente que marca de más genera llamadas al receptor en cada turno.
- Anti-regresión de voz: el agente que entra a atender el Caso 2 no arrastra los hechos del Caso 1.

**E2E** (`frontend/e2e/`): un chat con divorcio y tránsito produce dos casos, y el board los muestra a ambos.

---

## 9. Migración

**No hay migración de datos.** El producto todavía no está lanzado y todo lo almacenado es data de prueba, descartable si hace falta (decisión del dueño del producto, 2026-08-05).

**Pero el reset no es necesario.** El cambio de schema es no destructivo: quitar el `@unique`, agregar el compuesto, agregar `casoActivoId` y backfillearlo con el caso único existente de cada conversación. Ninguna fila actual viola el constraint nuevo, porque el `@unique` viejo era estrictamente más fuerte. La autorización a borrar simplifica el riesgo del deploy, no obliga a ejercerla.

**Si igual se resetea**, tener presente qué se lleva puesto: las `NotaRevision` cuelgan de `Conversation` con `onDelete: Cascade`. Al 2026-08-05 hay **5 notas ABIERTAS** (la última del 03/08, aún sin procesar por `pnpm feedback:pull`), 12 RESPONDIDAS esperando al experto y 23 respuestas en hilos. Procesar las abiertas con la skill `revisar-feedback-legal` antes de borrar cuesta poco y evita perder feedback ya emitido.

**Limpieza puntual** (recomendada, independiente del reset): las conversaciones ya contaminadas (categoría y subcategorías incoherentes, como `cmsb6a1420000qo021lb7e31c`) se corrigen o se borran a mano antes de que el equipo legal siga testeando contra ellas.

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| `derivar-tema` no dispara y el lead se pierde igual que hoy | Eval con las dos caras (§8); prompt sesgado a marcar de más por la asimetría de §2 |
| `derivar-tema` dispara de más y suma una llamada al receptor por turno | El falso positivo es no-op; se mide el costo en el board (`metricas-agente` ya trackea tool-calls) |
| El funnel reporta mal hasta el spec de métricas | Avisar al equipo antes de mergear (§7) |
| Dos especialistas alternando en un mismo thread suenan a dos personas | Todos comparten la rule `identidad-jurco` ("sos una sola voz en toda la conversación"); cubierto por el eval de voz |
