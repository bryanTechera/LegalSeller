# Spec — Arquitectura de agentes: clasificación jerárquica y subdominios

> Fecha: 2026-07-19 · Estado: **aprobada en brainstorming, pendiente de plan de implementación**
> Decisión validada con un panel de análisis multi-lente (conversión/UX, mecánica Mastra,
> escalabilidad, modos de falla, alternativas). Reemplaza el mapeo provisorio de
> `guia-arquitectura.md` §2.1-2.2 y cierra la "tensión del router" de `dominio-consultas.md` §3.

## 1. Decisiones fijadas

1. Para el usuario existe **un solo chat transparente**; todo el ruteo es interno.
2. **Una categoría por conversación**, persistida. Cambios de tema = interés adicional
   registrado en el caso; sin re-ruteo (salvo una corrección acotada, ver §6).
3. La **captación del caso (lead)** es parte de esta arquitectura, no un agregado posterior.
4. **Escalar = agregar carpeta de subdominio + entrada en el registry.** Los agentes
   existentes no se tocan.
5. **Clasificación jerárquica en dos niveles, pero un solo receptor conversacional.**
   El nivel 1 (categoría) es una "ventanilla" real; el nivel 2 (subcategoría) vive
   colapsado dentro del agente de categoría y es dato del caso, no estado de ruteo.
6. **El dueño de la conversación y del funnel es el agente de CATEGORÍA** (4 prompts de
   venta en el universo completo, no ~15). Los sub-agentes nunca venden.

Alternativas descartadas y por qué: supervisor único Networks (doble salto LLM por
mensaje); agente único con prompt dinámico (sin aislamiento por dominio); receptor
conversacional por categoría + experto por subcategoría (fricción pre-valor en el punto
más frágil del funnel, pin a subcategoría que el dominio no admite —despido y rubros
co-ocurren—, y ~20 agentes con 15 prompts de venta divergentes).

## 2. Topología

```
Usuario ──► BFF (Next.js)
              │  lee Conversacion.categoria en Prisma (switch determinista)
              │
              ├─ null ────► agente RECEPTOR GLOBAL  ── tool asignar-clasificacion
              │             (conversa lo mínimo para clasificar; fuera-de-cobertura
              │              también capta contacto)
              │
              └─ asignada ► agente de CATEGORÍA (laboral | familia | …)
                            dueño del funnel: evacúa con citas, recaba, capta
                            ├─ tool buscar-documentos (filtro por subcategorías del caso)
                            ├─ tool registrar-caso (captura incremental del lead)
                            ├─ tool corregir-clasificacion (máx. 1 por conversación)
                            └─ [futuro] sub-agentes Networks si la expertise diverge
```

En régimen: **una sola llamada LLM por mensaje**. La clasificación se paga una vez.

## 3. Receptor global

- Único clasificador conversacional. Generado por **factory** (`crear-receptor`) con el
  enum de categorías **habilitadas** desde el registry.
- Misión: obtener lo mínimo para clasificar. **Clasificación oportunista**: intenta
  clasificar desde lo ya dicho ANTES de preguntar. Presupuesto duro: máx. 1-2 preguntas,
  cada una acompañada de micro-valor empático; nunca un turno que sea solo pregunta.
  No busca en el corpus ni responde consultas de fondo.
- **Tool `asignar-clasificacion`** (contrato Zod):
  - `categoria` (obligatoria): enum de habilitadas + escapes `fuera-de-universo` y
    `categoria-no-habilitada` (ambas se registran como señal de demanda para el roadmap).
  - `subcategoria` (opcional): **fast-path** — si el relato ya la trae, ambos niveles se
    asignan en un solo tool-call.
  - `confianza`, `casoSensible`, `brief` (resumen estructurado de lo relatado).
- **Fuera de cobertura también convierte**: el receptor dispone de `registrar-caso` para
  ofrecer captación ("dejanos tu contacto y vemos si un abogado de la red puede tomarlo").
- **Caso sensible** (p. ej. violencia de género): chequeo transversal PREVIO a todo
  triage, en el bloque estable de todos los prompts + campo en el contrato. Al detectarse:
  cortocircuito a respuesta con canales de ayuda, cero preguntas clasificatorias.
  → **Pregunta abierta para el equipo de expertos legales**: contenido exacto de esa
  respuesta y canales a incluir (registrada acá per lineamientos §3.13).

## 4. Agente de categoría (dueño del funnel)

- Conduce la conversación completa: evacúa dudas con citas, recaba el caso, detecta el
  momento de pedir contacto. **Nivel 2 colapsado**: si la subcategoría no vino del
  receptor, la determina él conversando (solo conoce sus 2-5 opciones) y la registra vía
  `registrar-caso` — sin handoff a otra ventanilla.
- **Subcategoría = dato acumulativo del caso** (`["despido","rubros-laborales"]`):
  parametriza el filtro de retrieval y enriquece la derivabilidad; nunca bloquea.
- **Skill de venta como stage compartido** del prompt (un archivo, compuesto por los 4
  agentes): cuándo pedir contacto, micro-valor, tono. Misma persona y voz en todos los
  agentes — el cambio de agente es invisible.
- Regla NUNCA en todos los prompts: **nunca re-preguntar lo que el usuario ya contó**
  (el thread es compartido y la working memory lleva el caso).
- Retrieval directo: `buscar-documentos` con filtro por subcategorías (WHERE en pgvector),
  sin salto Networks. **Criterio de promoción a sub-agente Networks**: solo cuando las
  evals muestren que el prompt del agente de categoría degrada al discriminar su área.

## 5. Estructura de carpetas y registry

```
backend/src/mastra/dominios/
  registry.ts            ← FUENTE ÚNICA: categorías/subcategorías, habilitadas,
                            agentes para new Mastra(), enums Zod, etiquetas de corpus,
                            lista que consume el BFF
  recepcion/             ← receptor global (instancia de la factory)
  laboral/
    index.ts             ← agente de categoría (desde factory de agentes)
    instructions.ts      ← skills del área + stage de venta compartido
    clasificacion.ts     ← descripción/señales para el enum del receptor
    despido/             ← subcategoría: etiquetas de corpus, skills, evals
  (familia/ … misma forma)
common/
  crear-receptor.ts      ← factory del receptor
  crear-agente.ts        ← factory que hornea los gotchas (maxSteps en defaultOptions,
                            temperature: 1, provider order, null-guard de instructions)
  venta-stage.ts         ← skill de venta compartida
```

Habilitar una subcategoría = crear su carpeta + entrada en el registry (verificable en
code review). Cortocircuitos data-driven: nivel con **una sola opción habilitada** → el
BFF auto-asigna sin que corra ningún agente clasificatorio.

**Cómo consume el BFF el registry**: endpoint custom del backend (`server.apiRoutes`,
`GET /api/dominios`) que devuelve categorías/subcategorías habilitadas; el BFF lo lee
server-side (nunca el browser) y lo cachea en memoria con TTL corto. Un solo origen,
sin constantes duplicadas entre servicios.

## 6. Modelo de datos (Prisma, dueño: BFF)

```
Conversacion:  + categoria String?  + clasificadaEn DateTime?
               (upsert idempotente por sessionId — cubre doble-submit y reintentos)

Caso (el lead, EL entregable):
  id, conversacionId (1:1), categoria
  subcategorias String[]        ← acumulativas
  resumen Json                  ← hechos/fechas estructurados
  contactoNombre/Telefono/Email ← nullables (captura incremental)
  estado: en_conversacion | captado | fuera_de_cobertura
  origen: dominio | fuera_de_cobertura

CasoEvento (append-only, auditoría del equipo que deriva):
  casoId, tipo: clasificacion | correccion | registro-dato | contacto, payload Json
```

- `corregir-clasificacion`: máx. **una** re-asignación por conversación, guardada por el
  BFF, persistida como evento append — el equipo humano ve el rastro.
- Captura incremental: el caso se crea temprano y se completa a medida que aparecen
  datos; un abandono deja un lead parcial y señal registrable.

## 7. Mecánica del turno de clasificación (proxy SSE del BFF)

- El proxy interpone un `TransformStream`: pipea al browser mientras observa los eventos
  tool-call (`asignar-clasificacion`, `registrar-caso`). Parser tolerante (lecciones del
  gotcha `payload.text`).
- **Encadenamiento same-turn (fast-path)**: con confianza alta el receptor emite solo el
  tool-call, sin texto; el BFF persiste y llama al agente de categoría dentro de la misma
  respuesta HTTP, empalmando streams. El usuario ve: pregunta → respuesta con citas, un
  solo turno visible.
  - **SPIKE obligatorio al inicio de la implementación**: mecanismo Mastra v1 para no
    duplicar el mensaje del usuario en el thread compartido en el segundo call (opciones
    de persistencia de mensajes del endpoint de stream, o dedup vía API del thread).
    El comportamiento deseado es fijo; el mecanismo se confirma contra la doc de Mastra.
- **Endurecimiento**:
  1. El BFF consume el stream upstream desacoplado del abort del cliente — si el browser
     se cierra tras ejecutarse la tool, la asignación se observa y persiste igual.
  2. Reconciliación al mensaje siguiente: si el historial del thread tiene una asignación
     sin registro en Prisma (stream cortado), se re-persiste idempotente antes de rutear.
- Working memory extendida con los campos del caso: los hechos recabados sobreviven la
  ventana `lastMessages: 10` en el handoff.

## 8. PII, observabilidad y métricas

- Los payloads de tools llevan PII (contacto, hechos): extender la redacción en **ambos**
  loggers (`SensitiveDataFilter` backend con keys `contacto*`, `telefono`, `email`;
  redacción del logger del FE). El BFF nunca loguea payloads SSE crudos.
- Retención de casos anónimos abandonados sin contacto: job de limpieza con TTL.
  → **Pregunta abierta para negocio**: valor del TTL.
- Métricas desde `CasoEvento` + estados de conversación: conversaciones iniciadas,
  drop-off por etapa (recepción / categoría), tasa de conversión, consultas fuera de
  cobertura. **Guardrail**: mediana de turnos hasta la primera respuesta con citas ≈ 1 —
  si sube, la recepción está interrogando de más.

## 9. Evals como gate de escalado

- **Golden set** de primeros mensajes reales etiquetados (categoría esperada / escape /
  caso sensible) para medir precisión del receptor. **Habilitar la segunda categoría
  requiere pasar el threshold** definido sobre ese set.
- Evals de conversión para el stage de venta compartido (momento del pedido de contacto,
  micro-valor en las preguntas).
- Regresión de "turnos hasta clasificación" en el dataset del receptor.

## 10. v1 (Laboral/Despido) — qué corre de verdad

- El **receptor global corre de verdad** (no pass-through): su trabajo real hoy es el
  camino fuera-de-cobertura, que convierte y recolecta la señal de demanda del roadmap.
- Fast-path: consulta laboral → `asignar-clasificacion` en el primer tool-call; el BFF
  auto-registra `despido` (única subcategoría habilitada, cortocircuito por registry).
  **Ningún usuario on-topic ve una pregunta clasificatoria en v1.**
- Un solo agente de categoría (`laboral`), sin sub-agentes Networks.

## 11. Migración de lo existente

| Qué | Cambio |
|---|---|
| `agents/main/consultas/` | Se convierte en `dominios/laboral/` (agente `laboral`); sus patrones se extraen a `crear-agente.ts` |
| `frontend/src/lib/agent-service.ts` | `agentId` deja de ser literal `"consultas"` → derivado del registry |
| Proxy SSE (`app/api/chat/stream/route.ts`) | De pipe literal a `TransformStream` observador + ruteo por estado |
| Ingesta / `buscar-documentos` | Metadata `categoria`/`subcategoria` por chunk + filtro en la query pgvector |
| `guia-arquitectura.md` §2.1-2.2 | Reescribir: ruteo en el BFF por clasificación persistida; sub-agentes Networks pasan a opcionales con criterio de promoción |
| `dominio-consultas.md` §3 | Cerrar la nota de tensión del router (el ruteo vive en el BFF; el clasificador es el receptor global) |
| Threads existentes sin clasificación | Sin backfill (solo datos de prueba): al próximo mensaje rutean a recepción |

## 12. Preguntas abiertas registradas

| Pregunta | Para quién |
|---|---|
| Contenido y canales de la respuesta de caso sensible (violencia de género) | Expertos legales |
| TTL de retención de casos anónimos abandonados | Negocio |
| Mecanismo Mastra v1 de no-duplicación del mensaje en el encadenamiento same-turn | Spike técnico (primer task del plan) |
