# Guía de codificación — Backend (Mastra)

Patrones concretos para `backend/`. Provienen de un backend Mastra en producción; los fragmentos de código son el patrón a replicar. Complementa a `docs/guia-arquitectura.md` §2.

## 1. Tooling

- `package.json`: `"type": "module"`, `packageManager` con pnpm fijado, Node >= 22.
- Scripts: `dev` → `mastra dev`; `build` → `mastra build`; `start` → `mastra start`; `test` → `vitest run`; `lint` → `eslint src/`; `evals` → `tsx src/test/run-evals.ts`.
- `tsconfig.json`: `target`/`module` ES2022, `moduleResolution: "bundler"`, `strict: true`, `noEmit: true` (Mastra hace el bundling), sin path aliases (imports relativos).
  - Gotcha heredado: `tsc --noEmit` es ruidoso por tipos del framework — la señal de calidad es `lint` + `test`, no `typecheck`.
- ESLint (flat config): `strictTypeChecked` + `stylisticTypeChecked` con `projectService: true`. Reglas de proyecto:
  - `no-console: "error"` (excepto `src/test/**`, `src/scripts/**`, `*.test.ts`).
  - `no-restricted-imports` prohibiendo el barrel `@mastra/core` → **siempre subpaths**: `@mastra/core/agent`, `@mastra/core/tools`, `@mastra/core/workflows`.
  - `import-x/order` (builtin → external → internal → parent → sibling → index, línea en blanco entre grupos, alfabético).
  - `no-unused-vars` con patrón `^_` ignorado.
  - `@typescript-eslint/restrict-template-expressions` rechaza `number` en template literals (ej. placeholders SQL `$${params.length}`) — envolver en `String(...)`.
- `vitest.config.ts`: `environment: "node"`, `include: ["src/**/*.test.ts"]`, y en `env` de test: `DATABASE_URL` no-op + `MASTRA_DISABLE_STORAGE_INIT: "true"` (evita `ECONNREFUSED` como unhandled rejection en tests) + `GOOGLE_GENERATIVE_AI_API_KEY` no-op (`config/embedding.ts` tira una excepción al importarse si la key no está seteada — cualquier test que importe, aunque sea transitivamente, un módulo que importe `embedding.ts` crashea al levantar el archivo, no al correr el test).
- Pre-commit: husky + lint-staged (`eslint --fix` sobre `src/**/*.ts`).

## 2. Estructura de carpetas

Dominios del negocio separados, infraestructura del harness plana:

```
backend/src/
├── models/                 # tipos de estado sincronizado con el FE
├── scripts/                # scripts operativos (tsx)
├── test/                   # runners de evals, datasets, fixtures, e2e
└── mastra/
    ├── index.ts            # instancia Mastra + apiRoutes custom
    ├── agents/
    │   ├── main/<id>/      # agentes FE-facing: index.ts + tools.ts + instructions.ts (+ tests)
    │   └── workflow-agents/
    ├── dominios/<dominio>/ # por dominio legal: {agents,rules,tools,skills}/
    ├── common/             # logger, memory, middleware (helpers RequestContext), prompting
    ├── config/             # storage.ts, embedding.ts, definitions.ts
    ├── tools/              # tools cross-cutting
    ├── workflows/
    ├── services/           # document-registry (ingesta RAG), exports, integraciones
    └── utils/
```

Cada agente principal en `agents/main/<id>/` sigue el patrón de archivos: `index.ts` (el `Agent`), `tools.ts` (`buildTools()`), `instructions.ts` (instrucciones dinámicas), cada uno con su `.test.ts` al lado.

## 3. Agentes

```typescript
export const consultasAgent = new Agent({
  id: "consultas",
  name: "consultasAgent",
  description: "Agente principal de consultas legales...",
  instructions: dynamicInstructions,   // (ctx) => string; tolera requestContext undefined
  memory: sharedMemory,
  tools: dynamicTools,                 // (ctx) => buildTools(readOnly)
  model: gateway("google/gemini-3-flash"),
  maxRetries: 3,                       // main = 3, sub-agentes = 2
  defaultOptions: dynamicOptions,      // maxSteps, modelSettings, providerOptions
  agents: subAgents,                   // patrón Networks: delegación a expertos
});
```

Gotchas de producción (aprendidos, no negociables):

- **`maxSteps` NO va en el constructor** (Mastra v1 lo dropea): va en `defaultOptions.maxSteps`.
- **`temperature: 1` explícito** con Gemini vía gateway: el gateway aplica 0 por default y Gemini 3 con temperature 0 entra en loops.
- Razonamiento: Gemini 3 usa `thinkingLevel`; Gemini 2.5 usa `thinkingBudget`. Con tools, Gemini 2.5 ignora `thinkingBudget: 0`.
- Agentes principales pinean `gateway.order: ["google", "vertex"]` para que funcione el implicit caching de Gemini.
- `.network()` está deprecado — usar `.stream()` con `maxSteps`.
- **`server.apiRoutes` (custom routes vía `registerApiRoute`) no pueden empezar con el `apiPrefix` built-in (default `/api`)** — Mastra lo valida al boot y tira `Error: Custom API route "..." must not start with "/api"` (comportamiento intencional desde ~1.29, no un bug). Las rutas custom van sin el prefijo (ej. `/dominios`, no `/api/dominios`); solo se puede recuperar el prefijo `/api` para rutas custom si se reconfigura `server.apiPrefix` a otro valor, pero eso mueve también las rutas built-in (`/api/agents`, etc.) — no vale la pena para un solo endpoint.

Model stack de referencia (calibrar con evals): agentes principales → modelo mid-tier rápido (`gemini-3-flash`); sub-agentes expertos y generadores → tier lite; jueces de evals → el lite más barato; retrieval web (si se necesita) → `perplexity/sonar` con `tools: {}` obligatorio.

## 4. Tools

Patrón con `createTool` de `@mastra/core/tools`:

```typescript
export const searchDocumentsTool = createTool({
  id: "buscar-documentos",
  description: `Busca fragmentos relevantes en el corpus legal.\nCUANDO USAR:\n- ...`,
  inputSchema: z.object({
    query: z.string().min(1).meta({ description: "Consulta en lenguaje natural" }),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  outputSchema: z.object({
    chunks: z.array(ChunkSchema),
    count: z.number(),
    mensaje: z.string(),
  }),
  execute: async (input, executionContext) => {
    const logger = executionContext.mastra?.getLogger() ?? fallbackLogger;
    try {
      const queryEmbedding = await generateEmbedding(input.query);
      const pool = getPool();
      const result = await pool.query(
        `SELECT ..., 1 - (embedding <=> $1::vector) AS similarity
         FROM "DocumentChunk"
         WHERE 1 - (embedding <=> $1::vector) > $2
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        [toVectorLiteral(queryEmbedding), MIN_SIMILARITY, input.limit],
      );
      return { chunks, count: chunks.length, mensaje: "..." };
    } catch (error) {
      logger.error("buscar-documentos failed", {
        tool: "buscar-documentos",
        error: error instanceof Error ? error.message : String(error),
      });
      return { chunks: [], count: 0, mensaje: "No pude buscar en el corpus. Pedile al usuario que reintente." };
    }
  },
});
```

Reglas:

- `id` kebab-case español. La `description` dice **qué hace y cuándo usarla** — nunca comportamiento, tono ni formato de respuesta (eso va en las instrucciones del agente).
- Validaciones y formatos van en los schemas Zod con `.meta({ title, description, examples })` — no duplicados en la description.
- **`execute` nunca tira**: degradación graceful devolviendo `{ status: "error" | ..., mensaje }` con mensaje en español orientado al usuario. `as const` para literales de status; discriminated unions con `z.enum` para outputs con variantes.
- Estado sincronizado con el FE se lee con `getReadOnlyFromContext(executionContext.requestContext)` — nunca de working memory, nunca de env.
- Logger: `executionContext.mastra?.getLogger() ?? fallbackLogger`, con campo estructurado `{ tool: "<id>" }`.

## 5. RAG: ingesta y retrieval

- **Un solo helper de embeddings** (`config/embedding.ts` → `generateEmbedding(text): Promise<number[]>`) con `gemini-embedding-001` vía `@google/genai`. Nadie más llama a la API de embeddings.
- Ingesta en `services/document-registry/`: extracción → chunking con overlap y metadata (documento, sección/artículo, posición) → embedding por chunk → insert pgvector (`'[v1,v2,...]'::vector`). El registro es **best-effort para índices secundarios**: nunca tira; loguea y sigue.
- Retrieval: SQL directo (patrón de §4). Umbral de similitud como constante nombrada, calibrada con evals.
- Los chunks devueltos llevan siempre su metadata de origen: en dominio legal la cita de fuente es parte del contrato de respuesta.

## 6. Storage, memoria y contexto

- `config/storage.ts`: un `pg.Pool` con `keepAlive: true`, envuelto por `PostgresStore`; `getPool()` lo expone a tools/services. Env faltante → `throw` inmediato con mensaje accionable.
- `common/memory/index.ts`, tres configs:
  - `sharedMemory` (agentes principales): working memory Markdown con `template:` (no `schema:`), scope `"thread"`, `lastMessages: 10`, `generateTitle: true`.
  - `subagentMemory`: `workingMemory.enabled: false`, `lastMessages: 10`.
  - `workflowAgentMemory`: sin working memory, `lastMessages: 0`.
- `common/middleware/`: solo **helpers tipados de lectura** del `RequestContext` (`getReadOnlyFromContext`, `getThreadIdFromContext`, `getResourceIdFromContext`) — Mastra auto-mergea el `requestContext` del body; no hay middleware propio.

## 7. Prompting

- Instrucciones ensambladas por `ActivationRegistry` sobre los registries de rules y static skills (no un `PromptAssembler` monolítico ni el `prompt-stages.ts` original, eliminado en la migración al sistema de rules/skills): orden cache-friendly rules.inicio → static skills → rules.final (recencia, ej. captación de caso) → bloques volátiles (brief del caso, nombre de usuario). Solo lo volátil al final (preserva el prefijo cacheado).
- **Tags XML en español**: `<rol>`, `<reglas>`, `<restricciones>`, `<contexto>`, `<ejemplos>`, `<herramientas>`, `<instrucciones>`, `<verificacion>`, `<errores_comunes>`. No usar tags que colisionen con IDs de tools.
- **Rules vs skills**: rules = restricciones de comportamiento ("NUNCA respondas sin citar la fuente"); skills = conocimiento del dominio (criterios jurídicos, heurísticas de interpretación). Rules ordenadas por prioridad de atención (primacy/recency — lo crítico al principio o al final, nunca en el medio).
- Contrato sub-agente → supervisor: el sub-agente emite solo bloques de datos XML (`<documentos_data>`, `<citas_data>`) dentro de `<formato_salida_para_supervisor>`, sin prosa afuera; el supervisor compone con su propia voz y cita literalmente.
- Estilo: framing positivo, incluir la motivación de cada regla, español (rioplatense si el producto lo usa), sin emojis.
- El prompt-builder es asimétrico ante errores: con `readOnly === null` (startup/listing de Mastra) devuelve string vacío sin tirar; con `readOnly` presente re-lanza (un bug real no debe correr un agente sin system prompt).
- Lint mecánico de prompts en pre-commit (script que detecta tags en inglés, emojis, filler) — portar el `prompting-check` del proyecto anterior.

> El sistema de rules/skills (taxonomía RAG/skill/rule, registries, calidad de
> contenido inyectado) está definido en `.claude/rules/rules-and-skills-taxonomy.md`
> y `.claude/rules/prompt-assembly.md`. El contenido de los prompts vive en
> `src/mastra/dominios/*/rules|static-skills|tool-skills` — no editar instructions
> monolíticas.

## 8. Logging

Dos tiers, `PinoLogger` de `@mastra/loggers`, nunca instanciado directo:

- **Dentro del runtime** (tools, workflow steps): `executionContext.mastra?.getLogger()` con `{ tool: "..." }` o `{ workflow: "..." }`.
- **Fuera del runtime** (services, config, scripts): `makeLogger("modulo")` — factory única en `common/logger.ts` que resuelve `LOG_LEVEL` en un solo lugar.

## 9. Testing y evals

**Unit (Vitest)** — lógica determinista: activación de rules/skills, validadores, parsers, chunking, merges. Gotchas heredados: registries singleton sin reset → IDs únicos por test; mocks parciales de `mastra` deben incluir stub de `getLogger`; preferir `() => Promise.resolve()` a `async () => {}` en mocks.

**Evals (LLM-as-judge)** — el mecanismo de calidad de los agentes:

- Runner propio (`src/test/run-evals.ts`, `pnpm run evals`): crea un agente fresco por ítem con tools interceptadas (write tools mockeadas, read tools pass-through con tracing), corre scorers y un matcher programático de tool calls, persiste a SQLite y aplica **quality gates por thresholds**.
- Scorers con `createScorer` de `@mastra/core/evals` + factory `makeLLMScorer` (`.analyze()` con outputSchema Zod, `.generateScore()`, `.generateReason()`); juez = modelo lite barato. Sentinel `-1` para "criterio no aplica".
- Datasets JSON versionados por agente (`src/test/agents/<id>/datasets/`) + thresholds por dataset. Para LegalSeller los datasets críticos (gated, bloquean build) serían: **fidelidad a las fuentes / no alucinación de citas**, **corrección jurídica de la respuesta**, **cumplimiento de rules**. El resto, informativos.
- Flujo iterativo: medir → analizar diagnósticos → ajustar prompt/tools → verificar → estabilizar 2-3 corridas → subir threshold.

## 10. Manejo de errores (resumen)

| Contexto | Patrón |
|---|---|
| Env requerida faltante | `throw` al cargar el módulo de config, mensaje accionable |
| Dentro de `execute` de tool | Nunca throw: `{ status: "error", mensaje }` en español + log |
| Inits a nivel módulo | `.catch()` que loguea sin tirar el proceso |
| Servicios best-effort (registros secundarios) | Nunca tiran; loguean y siguen |
| Prompt-builder | Asimétrico (ver §7) |
