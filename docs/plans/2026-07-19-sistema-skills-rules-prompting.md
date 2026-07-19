# Spec: sistema de rules/skills + workflow de conocimiento legal

> Diseño aprobado en brainstorming (2026-07-19). Porta el sistema de skills/rules del
> proyecto colar (`/home/bryan/agent`) a LegalSeller, combinado con el RAG, y define el
> workflow iterativo por documento del equipo de expertos legales. Plan de
> implementación: se genera a partir de este spec.

## 1. Problema y objetivo

El equipo de expertos legales va a enviar información de forma continua. Cada documento
debe mejorar el sistema de forma iterativa: corpus RAG, conocimiento curado de los
agentes, restricciones de comportamiento y evals. Hoy los prompts de `recepcion` y
`laboral` son strings monolíticos en `instructions.ts` — no hay un lugar canónico donde
"agregar conocimiento" ni un proceso definido para procesarlo.

Objetivo de esta iteración:

1. **Infraestructura runtime**: registries de rules / static skills / tool skills sobre
   la factory `crearAgente` existente (enfoque B aprobado: la firma
   `buildInstructions(readOnly)` y el wiring BFF/SSE verificado en vivo no cambian).
2. **Migración del contenido actual** a rules/skills, con prompt ensamblado
   **byte-idéntico** al actual (gate de regresión más fuerte posible).
3. **Guías `.claude/rules/`** adaptadas de colar al dominio legal.
4. **Skill invocable `procesar-documento-legal`** que encoda el workflow por documento.

## 2. Decisiones tomadas (brainstorming)

| Decisión | Elección |
|---|---|
| Alcance | Infra completa + migrar prompts actuales (sistema ejercitado desde día uno) |
| Tipos soportados en código | Rules + static skills + **tool skills** ahora; reports queda afuera (YAGNI) |
| Workflow por documento | Skill de Claude Code invocable (`.claude/skills/procesar-documento-legal/`) |
| Arquitectura | Registries sobre la factory actual (NO port del PromptAssembler de colar) |
| LLM-as-judge | Solo la guía `eval-design.md`; scorers reales cuando haya contenido que juzgar |

## 3. Taxonomía: tres destinos para el conocimiento

A diferencia de colar (dos destinos), acá el triage decide entre **tres** — y un mismo
documento casi siempre alimenta varios:

| Contenido | Destino | Criterio |
|---|---|---|
| Texto normativo citable (leyes, plazos legales, jurisprudencia) | **RAG** (`pnpm ingest --categoria --subcategoria`) | El agente debe citarlo con fuente |
| Heurística de práctica profesional (cómo evaluar un caso, qué preguntar, errores comunes del consultante) | **Skill** (static o tool) | Conocimiento que el agente aplica, no cita |
| Restricción de comportamiento (qué nunca afirmar, identidad, formato, safety) | **Rule** | Le dice al agente CÓMO actuar |

**Litmus test clave del dominio**: si el agente debería citarlo con fuente, va al RAG,
no a una skill. Las skills no embeben citas normativas ni números de artículo — refieren
conceptos y mandan a `buscar-documentos`. Motivo: una cita hardcodeada en un prompt no
se actualiza cuando cambia la ley y esquiva la regla "SIEMPRE citar fuente". Corolario:
la regla de colar "sin información temporal" se resuelve así — lo que vence vive en el
RAG (re-ingestable), nunca en skills.

## 4. Capa runtime

### 4.1 ActivationRegistry

`backend/src/mastra/common/activation-registry.ts` — clase genérica (patrón colar):

```typescript
interface RegistryItem {
  id: string;
  fn: (readOnly: ReadOnlyState | null, agentId: AgentId) => string | null;
  critical?: boolean;            // si fn tira: el prompt no se construye
  posicion?: "inicio" | "final"; // default "inicio"; ver §4.4
}

interface ExecuteResult {
  inicio: string;      // bloques posicion "inicio" concatenados con \n\n
  final: string;       // bloques posicion "final"
  activatedIds: string[];
  failedIds: string[]; // ids no-críticos cuyo fn tiró (observable, no silencioso)
}
```

Si un item `critical` tira excepción, `execute()` re-tira: combinado con el null-guard
asimétrico de `crearAgente` (startup sin request → instrucciones vacías; request real →
throw), un agente nunca corre con identidad/safety rotas. Items no-críticos que fallan
van a `failedIds` y se loggean con el logger estructurado.

Dos instancias: `rulesRegistry` (en `backend/src/mastra/rules/index.ts`) y
`staticSkillsRegistry` (en `backend/src/mastra/skills/index.ts`), cada una con su array
de registración global ordenado (el orden de registración ES el orden en el prompt; el
subset por agente preserva ese orden).

### 4.2 Definiciones por dominio

```
backend/src/mastra/dominios/
├─ comunes/rules/            identidad-jurco, citas-corpus, alcance-informativo,
│                            correccion-clasificacion, captacion-caso
├─ recepcion/rules/          caso-sensible, mision-clasificacion, conduccion-triage
├─ recepcion/static-skills/  universo-categorias
├─ laboral/rules/            rol-especialista-laboral
├─ laboral/static-skills/    subcategorias-laboral
└─ laboral/tool-skills/      proceso-derivacion (seed)
```

Cada rule/static skill es un archivo con `CONTENT: Partial<Record<AgentId, string>>` y
una función exportada `(readOnly, agentId) => CONTENT[agentId] ?? null` (condicional si
aplica). Las rules en `comunes/` tienen hoy solo la key del agente que las usa; habilitar
una categoría nueva = agregar su key al CONTENT (no tocar estructura).

### 4.3 Sin wrapper de capa: cada bloque conserva su tag

Colar envuelve rules en `<reglas>` y skills en `<conocimiento_pedagogico>`. Acá **no**:
cada rule/skill lleva su propio tag XML en el contenido (`<personalidad>`,
`<caso_sensible>`, `<mision>`, `<reglas>`, `<subcategorias>`, `<captacion>`, …), como
hoy. El registry concatena con `\n\n` sin agregar wrappers. Motivo: preserva los prompts
verificados en vivo **byte a byte** (§4.5) y evita anidar tags existentes dentro de un
wrapper nuevo. La convención de tags queda documentada en la taxonomía (§6).

### 4.4 Composición por agente y mapeo de migración

`instructions.ts` de cada dominio pasa a ser un compositor fino:

```
rules(inicio) → static skills → rules(final) → bloques volátiles (brief/usuario)
```

`posicion: "final"` existe para conservar la sabiduría de orden de colar (instrucciones
de comportamiento con recencia) y el orden actual exacto de laboral, donde la captación
va después del conocimiento.

**Mapeo 1:1 del contenido actual (mismo texto, cero reescrituras):**

| Bloque actual | Destino | Agentes | Notas |
|---|---|---|---|
| `PERSONA_STAGE` (`<personalidad>`) | rule `identidad-jurco` (crítica) | recepcion, laboral | `common/prompt-stages.ts` se elimina al migrar |
| `<caso_sensible>` | rule `caso-sensible` (crítica) | recepcion | conserva el TODO(expertos-legales) |
| `<mision>` | rule `mision-clasificacion` | recepcion | |
| `<reglas>` de recepcion | rule `conduccion-triage` | recepcion | un solo bloque, como hoy |
| `<categorias_habilitadas>` + `<temas_aun_no_cubiertos>` | static skill `universo-categorias` | recepcion | fn computa desde `registry.ts` (dinámico, como hoy) |
| `<rol>` de laboral | rule `rol-especialista-laboral` | laboral | |
| `<reglas>` laboral, bullets 1–4 | rule `citas-corpus` (crítica) | laboral | buscar antes de responder, citar fuente, no inventar, honestidad sin fuentes |
| `<reglas>` laboral, bullets 5–6 | rule `alcance-informativo` (crítica) | laboral | no asesoramiento definitivo; subcategoría sin corpus → honesto + captación |
| `<reglas>` laboral, bullet 7 | rule `correccion-clasificacion` | laboral | |
| `<subcategorias>` | static skill `subcategorias-laboral` | laboral | fn computa desde `subcategoriasHabilitadas("laboral")` |
| `VENTA_STAGE` (`<captacion>`) | rule `captacion-caso`, `posicion: "final"` | laboral | recepcion NO la tiene (igual que hoy) |
| Bloques `casoBrief` / `userName` | quedan en `instructions.ts` (volátil) | ambos | sin cambios |

Nota: al partir `<reglas>` de laboral en tres rules, los bullets conservan texto y
orden, y el tag se reparte así: `citas-corpus` abre `<reglas>` en su primera línea y
`correccion-clasificacion` la cierra en su última — el ensamblado queda byte-idéntico.
Es un artefacto deliberado de la migración (un tag por rule rompería la byte-igualdad);
cuando el primer documento reescriba contenido de estas rules, los tags se normalizan
a uno por rule y el gate pasa a ser el golden set, no la byte-igualdad.

Rules críticas del proyecto (`CRITICAL_RULE_IDS`): `identidad-jurco`, `caso-sensible`,
`citas-corpus`, `alcance-informativo`.

### 4.5 Gate de byte-igualdad

Antes de migrar, los tests capturan el prompt actual de cada agente (con `readOnly`
null, con brief, con userName). Después de migrar, `instructions.test.ts` afirma que la
nueva composición produce **exactamente el mismo string**. Es el gate de regresión
principal: si es byte-idéntico, el comportamiento no puede haber cambiado por el prompt.
Complemento: el golden set del receptor (12 items, threshold 0.9) sigue verde.

### 4.6 Tool skills

`backend/src/mastra/skills/tool-skills/`:

```typescript
interface SkillToolDefinition {
  id: string;                                        // kebab español
  description: string | Partial<Record<AgentId, string>>;  // triggers "Muy útil cuando…"
  content: Partial<Record<AgentId, string>>;
  shouldActivate?: (readOnly: ReadOnlyState | null) => boolean; // default: siempre
}
```

`crearSkillTools(agentId, readOnly)` convierte las definiciones activas en tools Mastra
`guia-<id>` sin input, que devuelven `{ status: "ok", contenido }` — y ante cualquier
error `{ status: "error", mensaje }` (regla del repo: una tool nunca tira en `execute`).
Los agentes las reciben vía `buildTools` (spread junto a sus tools de señal).

**Seed real** (para no shipear registry vacío): `proceso-derivacion` — qué pasa después
de que el consultante deja sus datos, según `docs/vision-producto.md`: el equipo humano
revisa y clasifica el caso y lo deriva a un abogado de la red, que contacta al
consultante. Solo hechos que el doc de visión respalda — sin SLAs ni plazos inventados.
**Solo para `laboral`**: el receptor queda sin tool skills a propósito (maxSteps 5,
fast-path "sin escribir texto" — una tool extra es riesgo de distracción sin beneficio).

Anchor en directives (patrón colar): con el seed no hace falta — ninguna rule instruye
"explicá el proceso de derivación". La skill `procesar-documento-legal` (§7, fase 4)
chequea el anchor para cada tool skill futura.

## 5. Qué NO se porta (y por qué)

- **Reports**: no hay análisis multi-consumidor que lo justifique (YAGNI).
- **PromptAssembler con stages nombrados + facade**: indirección para 2 agentes;
  reescribiría una capa verificada en vivo.
- **Working-memory validators**: la activación condicional acá se evalúa sobre
  `ReadOnlyState` (y a futuro sobre estado de `Conversation`/`Caso` si se sincroniza).
- **Scorers LLM-as-judge**: se crean cuando el primer documento traiga contenido que
  juzgar; el workflow (§7 fase 6) lo exige por documento.

## 6. Guías `.claude/rules/` (dev-facing)

Adaptadas de colar; no se inyectan a agentes — gobiernan cómo trabajamos:

1. **`rules-and-skills-taxonomy.md`** — taxonomía de §3 con el litmus test RAG/skill/rule
   y ejemplos legales; guidelines de calidad de contenido inyectado (heredadas de colar,
   ya en uso): voseo rioplatense, voz para el agente (conocimiento que aplica, no
   guiones para el consultante), Goldilocks (heurísticas, ni recetas ni vaguedades),
   motivar el porqué, una idea = una vez, sin la palabra "skill" ni emojis en contenido
   inyectado, 2-3 ejemplos concretos, densidad sube / tamaño no crece. Convención de
   tags XML en español por bloque (§4.3).
2. **`agent-prompting.md`** — prácticas de prompting con ejemplos del dominio legal:
   degrees of freedom (LOW = citas del corpus textuales; MEDIUM = armado del caso;
   HIGH = conversación de venta/empatía), framing positivo con NUNCA reservado a safety,
   scope explícito (los modelos nuevos no generalizan), validación contra oracle externo
   (= `buscar-documentos`; nunca auto-crítica, una sola pasada), synthesis over dump,
   límites de opciones, orden de atención (referencia arriba, instrucciones al final,
   lost-in-the-middle), contradicciones se auditan sobre el ensamblado completo,
   glosario de terminología (consultante, caso, categoría/subcategoría, derivación,
   abogado de la red), thinking config para nuestro stack (gemini-3-flash vía gateway).
3. **`eval-design.md`** — sesgos LLM-as-judge (position, length, family, verbosity,
   inflation), calibración humana antes de gatear, error analysis bottom-up.
4. **`prompt-assembly.md`** — cómo funciona NUESTRO ensamblado (§4): registries, orden,
   rules críticas, cómo agregar una rule/static skill/tool skill nueva, gate de
   byte-igualdad como técnica de refactor de prompts.

Además: `docs/prompt-engineering/` (8 resúmenes de docs de Anthropic de colar) se copia
tal cual — agnóstico del dominio. `CLAUDE.md` suma el puntero a `.claude/rules/`;
`docs/guia-codificacion-backend.md` referencia la taxonomía desde su sección de
prompting.

## 7. Skill `procesar-documento-legal`

`.claude/skills/procesar-documento-legal/SKILL.md` — se invoca por cada material nuevo
del equipo legal. Fases con checklist obligatorio:

1. **Lectura completa** del documento (nunca por resumen) e identificación de piezas —
   un documento casi nunca es un solo destino.
2. **Triage por pieza**: ¿aporta algo que el modelo base no tiene? ¿aplica a Uruguay?
   ¿es accionable? ¿es citable? → RAG / skill / rule / **descarte documentado**. Ante
   ambigüedad legal: pregunta concreta registrada al equipo de expertos legales
   (lineamientos §3.13) y se sigue con lo no ambiguo.
3. **Mapeo contra lo existente**: corpus de la categoría (query a `Document` por
   categoría/subcategoría), grep sobre `dominios/*/rules|static-skills|tool-skills` y
   las guías. Lo nuevo NO es automáticamente mejor: REPLACE / REWRITE condensando /
   DISCARD / contradicción → INVESTIGAR y preguntar al equipo legal cuál rige. Nunca
   conservar dos versiones.
4. **Decisiones arquitectónicas**: ¿static o tool skill? (test: ¿el agente SIEMPRE lo
   necesita cuando la condición da true?); ¿split/merge?; ¿la tool skill nueva necesita
   **anchor** en una rule que diga "ofrecé/explicá X"? (sin anchor el agente improvisa
   con conocimiento genérico); ¿habilita categoría/subcategoría nueva? → registry +
   `docs/dominio-consultas.md` (columna Estado con fecha).
5. **Implementación**: ingesta RAG con `pnpm ingest <archivo> --title "…" --categoria
   --subcategoria`; rules/skills con orden ELIMINAR > REESCRIBIR > CONDENSAR > AGREGAR.
6. **Verificación y registro**: tests + lint + `pnpm evals` verdes; **cada documento
   agrega o ajusta items del golden set que midan el gap que vino a cerrar** (corpus
   nuevo → items de citación; conocimiento de subcategorías → items de detección);
   entrada fechada en `docs/plans/` con decisiones y descartes.

## 8. Verificación de esta iteración

- Tests unitarios de `ActivationRegistry`: activación por agente, orden preservado,
  `posicion: "final"`, critical → throw, no-critical → `failedIds` + log.
- `instructions.test.ts` de ambos agentes: **byte-igualdad** con los prompts actuales
  (casos: readOnly null, con brief, con userName).
- Tool skills: `crearSkillTools` genera `guia-proceso-derivacion` solo para laboral;
  la tool devuelve contenido; degradación graceful ante error.
- Gate real: golden set del receptor 12/12 ≥ 0.9 sin cambios; `pnpm test` + `pnpm lint`
  + `tsc --noEmit` verdes en backend (el frontend no se toca).

## 9. Fuera de alcance

Reports; LLM-as-judge scorers; reescritura de contenido de prompts (solo
reorganización); cambios en BFF/frontend; procesamiento del primer documento legal
(usa la skill nueva cuando llegue).

## 10. Preguntas abiertas registradas

- **Para negocio/equipo legal**: ¿hay plazos o SLA comunicables del proceso de
  derivación (cuánto tarda el contacto del abogado)? La tool skill `proceso-derivacion`
  arranca sin plazos; si existen, se agregan con fuente.
- Persisten las de la iteración anterior: corpus de despido; contenido definitivo de
  la respuesta de caso sensible (hoy TODO con 911 / 0800 4141).
