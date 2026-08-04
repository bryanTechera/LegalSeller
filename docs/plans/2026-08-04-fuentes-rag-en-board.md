# Fuentes del corpus visibles en el board — diseño

**Fecha**: 2026-08-04
**Estado**: aprobado, pendiente de plan de implementación
**Alcance**: `/board/chats/[id]` y la vista de sesiones de `/revision` — hacer visible qué recuperó el agente del corpus para responder cada mensaje.

---

## 1. Problema y objetivo

El equipo legal lee las conversaciones en `/board/chats/[id]` para juzgar si el agente responde bien. Hoy puede leer la respuesta, pero no la evidencia: cada llamada a `buscar-documentos` se renderiza como una línea suelta con el nombre de la tool y nada más ([`DetalleChat.tsx:121-129`](../../frontend/src/components/board/Chats/DetalleChat.tsx#L121-L129)). Sin ver los fragmentos recuperados, el abogado no puede distinguir los dos fallos que le importan:

1. **Falta de documentación** — la respuesta es pobre porque el corpus no tiene el material. Se arregla ingiriendo un documento.
2. **Error de interpretación** — el material estaba y el agente lo leyó mal, o afirmó más de lo que el texto dice. Se arregla con prompt y eval.

Los dos se ven idénticos desde afuera. El objetivo es que se distingan de un vistazo, y que el hallazgo se convierta en una nota accionable sin salir de la pantalla.

### Por qué ahora

Es la contraparte de retrieval del loop que ya existe (skill `revisar-feedback-legal`): la nota del experto entra al loop, pero hoy el experto no tiene cómo fundamentar "acá falta corpus" versus "acá el agente se fue del texto". Además, en la base de producción ya hay **3 búsquedas que volvieron vacías sobre 238** — huecos de corpus reales, hoy invisibles.

---

## 2. Lo que ya existe (verificado, no supuesto)

Verificado el 2026-08-04 con lecturas sobre la base de Railway y sobre el código:

| Hecho | Consecuencia |
|---|---|
| Los spans `tool_call` guardan el resultado **completo**: ~9 KB de `output` por llamada, con `documentId`, `documentTitle`, `section`, `content` y `similarity` por chunk | No hace falta tocar el backend, ni instrumentar nada nuevo, ni re-ejecutar consultas. Los chats históricos ya tienen la evidencia. |
| `construirTimeline(threadId, { conSpans: true })` ya trae `input`, `output` y `error` de cada tool call ([`timeline.ts:55-64`](../../frontend/src/lib/revision/timeline.ts#L55-L64)) | El dato ya llega al BFF del board; falta agruparlo y mostrarlo. |
| 238 llamadas a `buscar-documentos` sobre 60 threads: 235 `ok`, 3 `empty` | ~4 búsquedas por chat. El caso "sin resultados" es real y raro: merece tratamiento visual destacado, no una fila más. |
| El mensaje `assistant` se persiste **antes** que las búsquedas de su propio turno (mensaje `04:02:00.970` → búsqueda `04:02:01.345`) | La atribución cronológica ("lo que pasó antes de la respuesta") es **incorrecta**: le colgaría a cada respuesta las búsquedas de la anterior. Ver §4. |
| Los `agent_run` tienen ventana `[startedAt, endedAt]` que contiene tanto el mensaje `assistant` del turno como sus `tool_call` descendientes | Es el agrupador correcto. `timeline.ts` ya sube por `parentSpanId` hasta el `agent_run` ([`timeline.ts:170-177`](../../frontend/src/lib/revision/timeline.ts#L170-L177)). |
| Los umbrales de similitud están calibrados por categoría en el backend ([`buscar-documentos-tool.ts:42-45`](../../backend/src/mastra/tools/documentos/buscar-documentos-tool.ts#L42-L45)) | El frontend **no** los replica. Ver §5. |
| `Nota` tiene `messageId` y `citaTexto`, y `pnpm feedback:pull` levanta ambos orígenes | Anotar una búsqueda o un fragmento no requiere migración. |
| `/api/revision/sesiones/[id]` construye la timeline **sin** spans ([`route.ts:21`](../../frontend/src/app/api/revision/sesiones/[id]/route.ts#L21)) y `SesionView` filtra solo mensajes | Las búsquedas no viven en la timeline con spans: llegan por su propio camino (`construirBusquedas`, el mismo módulo que usa el board). El endpoint no necesita pedir spans para sumarlas — ver §6. |

---

## 3. Decisiones tomadas

| Decisión | Elección | Alternativa descartada |
|---|---|---|
| Dónde vive la evidencia | Columna derecha con solapas `Fuentes` · `Caso` · `Notas`; se carga al hacer clic en una respuesta del agente | Bloque plegado bajo cada respuesta (alarga la conversación); solapa aparte a nivel de página (rompe el vínculo respuesta↔evidencia); tres columnas (ahoga el texto de los fragmentos, que es lo que hay que leer) |
| Recuperado vs. usado | Se muestra **todo lo recuperado**, ordenado por similitud | Resaltar coincidencias de texto con la respuesta (heurística con falsos positivos); pedirle al agente que declare sus fuentes (toca prompts y arriesga regresiones de comportamiento) |
| Trazas técnicas en la timeline | Salen de la timeline; se resumen aparte | Dejarlas plegadas tras un toggle; dejarlas como están |
| Notas | Se puede anotar una búsqueda o un fragmento concreto | Solo notas sobre mensajes, como hoy |
| Alcance | `/board/chats/[id]` **y** `/revision` en la misma tanda | Solo el board |
| Umbral en la UI | Se nombra en prosa, sin el número | Copiar la tabla de umbrales al frontend |
| Backend | Sin cambios | Instrumentar el agente para declarar fuentes |

---

## 4. Modelo de datos y atribución

### 4.1 El módulo

Un módulo nuevo, `frontend/src/lib/revision/busquedas.ts` (`server-only`), con dos responsabilidades separadas para poder testear la difícil sin base:

- **Lectura**: consulta los spans del thread (`tool_call` con `entityName = 'buscar-documentos'`, más los `agent_run` para la ventana y los ancestros para el salto por `parentSpanId`).
- **Agrupación** (función pura exportada): recibe spans + mensajes y devuelve `BusquedaCorpus[]`. Se testea con fixtures.

`construirTimeline` no cambia de contrato. `DetalleConversacion` gana un campo `busquedas`.

```ts
interface FragmentoRecuperado {
  documentId: string;
  documentTitle: string;
  section: string | null;
  content: string;
  similarity: number;
}

interface BusquedaCorpus {
  spanId: string;
  messageId: string | null;   // la respuesta del turno; null = huérfana (§4.3)
  agente: string | null;
  consulta: string;           // el `query` que armó el agente
  categoria: string | null;
  subcategorias: string[];
  estado: "ok" | "empty" | "error" | "ilegible";
  fragmentos: FragmentoRecuperado[];
  fecha: string;
}
```

### 4.2 La regla de atribución

Para cada `tool_call` de `buscar-documentos`:

1. Subir por `parentSpanId` hasta el `agent_run` ancestro (mismo salto que ya hace `resolverAgente`, con el mismo tope de 20 saltos).
2. Tomar la ventana `[startedAt, endedAt]` de ese `agent_run`.
3. La respuesta del turno es el mensaje con `role = 'assistant'` cuyo `createdAt` cae dentro de la ventana. Si hay más de uno, el **último** (el agente puede emitir un mensaje intermedio antes de una segunda tanda de tools; el que el consultante lee como respuesta es el final).

**Por qué no por orden cronológico**: verificado en producción, el mensaje `assistant` se persiste al inicio del turno, antes de que corran sus propias búsquedas. Ordenar por reloj y asignar "las búsquedas anteriores al mensaje" produce un desfasaje de un turno — un error que la pantalla mostraría con total aplomo, en una vista cuyo único propósito es auditar. Es el riesgo principal de esta feature y por eso la agrupación va como función pura con test dedicado.

### 4.3 Búsquedas huérfanas

Un `agent_run` sin mensaje `assistant` en su ventana (turno cortado, error del modelo, `endedAt` nulo) deja sus búsquedas con `messageId: null`. **No se descartan**: aparecen en el mapa general de la solapa Fuentes marcadas "sin respuesta asociada". Es el mismo principio que ya aplica `SesionView` con las notas huérfanas — una omisión silenciosa en una pantalla de auditoría es peor que un dato incómodo.

### 4.4 Parseo tolerante

Esta vista lee datos históricos que atraviesan cambios de schema de Mastra. Todo parseo de `input`/`output` va con Zod `.catch`: un span cuyo shape no matchea se emite con `estado: "ilegible"` y su consulta visible si se pudo leer, y el resto de la página sigue funcionando. Ningún parseo tira.

---

## 5. La interfaz

### 5.1 Marca en cada respuesta del agente

Debajo de cada burbuja del agente, una línea chica y sobria: `2 consultas · 7 fragmentos`. Si alguna búsqueda del turno volvió vacía, la línea toma el color de alerta: `1 consulta · sin resultados`. Una respuesta sin búsquedas no lleva marca.

La burbuja entera es clickeable y queda resaltada mientras es la seleccionada. Con esto, el barrido de huecos de corpus se hace scrolleando la conversación, sin abrir nada.

### 5.2 Solapa `Fuentes`

La columna derecha pasa a tener tres solapas: `Fuentes` · `Caso` · `Notas (n)`. Al hacer clic en una respuesta, la columna salta sola a `Fuentes`.

Con una respuesta seleccionada, por cada búsqueda de ese turno:

- La **consulta textual** que armó el agente, tal cual (es el dato que revela si el agente entendió la pregunta), y la categoría/subcategorías con que la filtró.
- Sus **fragmentos ordenados por similitud**: título del documento, sección, el texto, y el score con una barra proporcional. El texto se recorta a ~400 caracteres con "ver más" — los chunks son largos y son hasta cinco por búsqueda.
- Si volvió **vacía**: un bloque de alerta con la consulta y la frase "ningún fragmento del corpus de *familia* superó el umbral de relevancia". **Sin el número**: los umbrales calibrados viven en un único punto de entrada en el backend y copiarlos al frontend garantiza que un día digan cosas distintas.
- Si volvió con **error** o **ilegible**: el estado dicho en prosa, con la consulta visible.

### 5.3 Estado inicial de `Fuentes`

Antes de hacer clic en ninguna respuesta, la solapa no está vacía: muestra el **mapa de todas las consultas del chat**, una por línea, con su cantidad de fragmentos y su mejor score, las vacías destacadas, y un contador `1 de 3 consultas volvió sin fuentes`. Clic en una línea → la conversación scrollea a la respuesta que la originó y la selecciona.

Un chat que nunca consultó el corpus muestra "este chat no consultó el corpus" — que es una señal en sí misma, no un estado vacío.

### 5.4 La timeline se limpia

Salen de la timeline las líneas `turno de laboral` y `openai/gpt-5.6-luna · 4210 entrada / 380 salida`: son ruido para el público real de la pantalla. Quedan solo los mensajes.

El detalle técnico se resume en un bloque plegado al pie del panel `Caso`: agentes que intervinieron, modelos usados, tokens y costo del chat, y las otras tools llamadas (`registrar-caso`, `asignar-clasificacion`) con su resultado. `updateWorkingMemory` es ruido interno de Mastra y no se muestra.

### 5.5 Notas sobre búsquedas y fragmentos

Cada búsqueda y cada fragmento llevan un "Dejar nota" que abre el `NotaComposer` existente:

- Sobre una búsqueda: `messageId` = la respuesta del turno, `citaTexto` = `Búsqueda: «...»`.
- Sobre un fragmento: `messageId` = la respuesta del turno, `citaTexto` = `Ley 10.489 — art. 4 (0.79): «...»`.
- Sobre una búsqueda huérfana: nota general (`messageId: null`) con la misma cita.

Sin migración de schema. Las notas quedan en el mismo hilo que las de mensaje y `pnpm feedback:pull` las levanta sin cambios, con el contexto de qué se buscó ya adentro de la cita.

---

## 6. Alcance en `/revision`

El componente de fuentes se construye compartido y se monta en las dos pantallas.

En `/revision` el cambio real fue uno solo: `/api/revision/sesiones/[id]` suma `busquedas` al payload llamando a `construirBusquedas(sesion.threadId)`, sin pedirle spans a la timeline — las búsquedas no viven ahí, y engordarla con `input`/`output` de cada tool call no tiene contrapartida (nadie los renderiza en esta pantalla). `SesionView` sigue filtrando `timeline` a `tipo === "mensaje"` para el transcript, igual que antes, y monta `PanelFuentes` aparte, alimentado directamente por `busquedas`.

**Particularidad de la vista en vivo**: ahí el chat corre en streaming (`useRevisionChat`), y los spans se escriben en la base con retraso respecto del stream. La marca de una respuesta recién terminada puede aparecer un instante después; el refetch que la vista ya hace la trae. No se agrega polling nuevo por esto.

---

## 7. Casos borde

| Caso | Comportamiento |
|---|---|
| Chat sin búsquedas | Solapa `Fuentes` con "este chat no consultó el corpus" |
| Búsqueda con `status: "empty"` | Bloque de alerta con la consulta y la frase del umbral, con acción de anotar |
| Búsqueda con `status: "error"` (la tool falló) | Estado dicho en prosa, consulta visible |
| Span con `output` de shape desconocido | `estado: "ilegible"`; la página sigue |
| `agent_run` sin mensaje `assistant` en ventana | Búsqueda huérfana en el mapa general (§4.3) |
| `agent_run` con `endedAt` nulo (turno en curso) | La ventana se cierra en "ahora"; en `/revision` es el caso normal de un turno vivo |
| Dos mensajes `assistant` en la misma ventana | Se atribuye al último |
| Chat con muchas búsquedas | Sin paginación: ~9 KB por búsqueda × ~4 = ~36 KB extra en el JSON del detalle, aceptable |

---

## 8. Verificación

- **Unit sobre la agrupación** (`busquedas.test.ts`, sin base, con fixtures): turno normal con una búsqueda; turno con dos; búsqueda huérfana; `output` corrupto; `status: "empty"`; dos mensajes `assistant` en la misma ventana. **El caso que no puede faltar**: dos turnos consecutivos, cada uno con su búsqueda, asertando que cada búsqueda cae en su turno y no en el anterior — es la regresión que el orden cronológico produciría.
- **Unit de componente** (Testing Library, patrón de [`NotaThread.test.tsx`](../../frontend/src/components/revision/NotaThread.test.tsx)): render de una búsqueda con fragmentos, de una vacía, del mapa inicial, y del "ver más".
- **E2E** en `board.spec.ts`: abrir un chat, clickear una respuesta, verificar que la solapa `Fuentes` carga la consulta y al menos un fragmento; y que una nota creada desde un fragmento aparece en la solapa `Notas`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` y `pnpm test` en `frontend/`. El e2e necesita el backend Mastra corriendo.

---

## 9. Fuera de alcance

- Cambios en el backend o en los prompts de los agentes (que el agente declare qué fragmento usó).
- Resaltado automático de coincidencias entre la respuesta y los fragmentos.
- Métricas agregadas de retrieval en `/board` (tasa de búsquedas vacías por categoría en el tiempo). Es el siguiente paso natural una vez que el equipo legal use esta pantalla y confirme que la señal sirve; se decide con esa evidencia, no antes.
- Editar o re-ejecutar una búsqueda desde el board.
