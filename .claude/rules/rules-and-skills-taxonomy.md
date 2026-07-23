# Rules & Skills Taxonomy

Define el sistema de clasificación de todo el conocimiento que alimenta el sistema (agentes y corpus), y las guidelines de calidad que aplican a todo el contenido inyectado en un system prompt. Guía dev-facing: NO se inyecta a los agentes — gobierna cómo trabajamos.

> **Sources**: [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Agent Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
> Adaptada al dominio legal de LegalSeller desde las guías del proyecto colar. Taxonomía y decisiones en `docs/plans/2026-07-19-sistema-skills-rules-prompting.md`.

---

## Taxonomy Definition

A diferencia de colar (dos destinos), acá el triage decide entre **tres** — y un mismo documento del equipo legal casi siempre alimenta varios (parte al RAG, parte a una skill, parte a una rule):

| Destino | Criterio | Ejemplo | Ubicación |
|---|---|---|---|
| **RAG** | Texto normativo (leyes, plazos legales, jurisprudencia): el agente debe **fundar su respuesta en ese texto**, traído con `buscar-documentos` (las fuentes son de uso interno, no se nombran al consultante) | "El art. X de la ley Y establece un plazo de Z días" | `pnpm ingest <archivo> --title "…" --categoria --subcategoria` → tabla `Document` (pgvector) |
| **Skill** (static o tool) | Heurística de práctica profesional (cómo evaluar un caso, qué preguntar, errores comunes del consultante): conocimiento que el agente **aplica, no cita** | "Para dimensionar un despido, relevá antigüedad, salario y forma de despido" | `src/mastra/dominios/<dominio>/static-skills/` · `.../tool-skills/` |
| **Rule** | Restricción de comportamiento (qué nunca afirmar, identidad, formato, safety): le dice al agente **CÓMO actuar** | "NUNCA des asesoramiento legal personalizado definitivo" · "Sos el especialista en derecho laboral" | `src/mastra/dominios/<dominio>/rules/` |
| **Compositor** | Orquesta el ensamblado: filtra por agente y concatena rules + static skills + bloques volátiles en el orden de atención | N/A | `src/mastra/dominios/*/instructions.ts` sobre `rulesRegistry` / `staticSkillsRegistry` (ver `prompt-assembly.md`) |

---

## Litmus Test

Usá estos ejemplos para clasificar contenido:

| Contenido | Clasificación | Por qué |
|---|---|---|
| "NUNCA des asesoramiento legal personalizado definitivo" | **Rule** | Restricción de comportamiento |
| "Para dimensionar un despido, relevá antigüedad, salario y forma de despido" | **Skill** | Heurística de práctica profesional |
| "El art. X de la ley Y establece un plazo de Z días" | **RAG** | Texto normativo citable con fuente |
| "Sos el especialista en derecho laboral" | **Rule** | Identidad/rol |

**Litmus clave**: si es texto normativo sobre el que el agente debería fundar su respuesta, va al RAG, no a una skill. Las skills no embeben citas normativas ni números de artículo — refieren conceptos y mandan a `buscar-documentos`. Una cita hardcodeada en un prompt no se actualiza cuando cambia la ley y esquiva la regla "SIEMPRE fundar en el corpus".

**Test rápido**: una frase que empieza con "NUNCA", "NO uses", "SIEMPRE usá" y que NO es conocimiento que el agente aplica, va como **rule**, no como skill.

---

## Rule File Template

Cada rule es un archivo `.ts` con un `CONTENT: Partial<Record<AgentId, string>>` y una función exportada `<id>Rule(readOnly, agentId) => CONTENT[agentId] ?? null`. Ejemplo real (`src/mastra/dominios/comunes/rules/identidad-jurco.ts`; contenido reformateado a varias líneas para legibilidad — el archivo real tiene el string de `<personalidad>` en una sola línea):

```typescript
import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const PERSONALIDAD = `<personalidad>
Sos el asistente legal de LegalSeller. Hablás en español rioplatense, de vos, con
calidez profesional: escuchás primero, explicás claro y sin tecnicismos innecesarios,
y nunca sonás a formulario ni a robot. Sos una sola voz en toda la conversación.
</personalidad>`;

// Rule incondicional (siempre activa para sus agentes)
const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: PERSONALIDAD,
  laboral: PERSONALIDAD,
};

export function identidadJurcoRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
```

Las rules **condicionales** evalúan sobre el `ReadOnlyState` (no hay working-memory validators en este proyecto):

```typescript
export function miRuleCondicionalRule(readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (readOnly?.casoBrief === undefined) return null; // solo cuando ya hay caso recabado
  return CONTENT[agentId] ?? null;
}
```

Habilitar una categoría nueva para una rule existente = agregar su `AgentId` al `CONTENT` (no se toca la estructura).

### Registración

Cada rule se registra en `src/mastra/rules/index.ts`. **El orden del array ES el orden en el prompt**; el subset por agente lo preserva:

```typescript
const RULES: readonly RegistryItem[] = [
  { id: "identidad-jurco", fn: identidadJurcoRule, critical: true },
  { id: "caso-sensible", fn: casoSensibleRule, critical: true },
  { id: "mision-clasificacion", fn: misionClasificacionRule },
  { id: "conduccion-triage", fn: conduccionTriageRule },
  { id: "rol-especialista-laboral", fn: rolEspecialistaLaboralRule },
  { id: "conducta-laboral", fn: conductaLaboralRule, critical: true },
  { id: "captacion-caso", fn: captacionCasoRule, posicion: "final" },
];

export const CRITICAL_RULE_IDS = RULES.filter((r) => r.critical === true).map((r) => r.id);
export const rulesRegistry = new ActivationRegistry("rules", RULES);
```

Flags del `RegistryItem`:

- **`critical: true`** — si su `fn` tira con un request real, el prompt NO se construye y el agente NO corre (identidad/safety rota nunca sale a producción). `CRITICAL_RULE_IDS` se **deriva** de la registración: nunca es una lista mantenida a mano. Hoy: `identidad-jurco`, `caso-sensible`, `conducta-laboral`.
- **`posicion: "final"`** — el bloque va DESPUÉS de las static skills, con recencia (directiva de comportamiento al final del prompt). Default `"inicio"`. Hoy: `captacion-caso` (la captación del caso, que va después del conocimiento).

### Estructura de directorios

```
src/mastra/
├─ common/activation-registry.ts   # clase ActivationRegistry (rules + static skills)
├─ rules/index.ts                   # RULES[] · rulesRegistry · CRITICAL_RULE_IDS
├─ skills/index.ts                  # STATIC_SKILLS[] · staticSkillsRegistry
├─ skills/tool-skills/index.ts      # TOOL_SKILLS[] · crearSkillTools
└─ dominios/
   ├─ comunes/rules/            identidad-jurco, captacion-caso
   ├─ recepcion/rules/          caso-sensible, mision-clasificacion, conduccion-triage
   ├─ recepcion/static-skills/  universo-categorias
   ├─ laboral/rules/            rol-especialista-laboral, conducta-laboral
   ├─ laboral/static-skills/    subcategorias-laboral
   └─ laboral/tool-skills/      proceso-derivacion
```

El ensamblado completo (flujo end-to-end, error paths, cómo agregar una skill nueva) está en `prompt-assembly.md`.

---

## Convención de tags XML

Colar envuelve rules en `<reglas>` y skills en `<conocimiento_pedagogico>`. Acá **no**: cada rule/skill lleva su **propio tag XML en español dentro del `CONTENT`**, sin wrapper de capa (decisión del spec §4.3). El registry concatena con `\n\n` sin agregar wrappers. Motivo: preserva byte a byte los prompts verificados en vivo y evita anidar tags existentes dentro de un wrapper nuevo.

Tags canónicos del proyecto:

| Tag | Bloque | Origen |
|---|---|---|
| `<personalidad>` | Identidad y voz del asistente | rule `identidad-jurco` |
| `<rol>` | Rol del especialista de categoría | rule `rol-especialista-laboral` |
| `<mision>` | Misión del receptor | rule `mision-clasificacion` |
| `<reglas>` | Reglas de conducción / conducta | rules `conduccion-triage`, `conducta-laboral` |
| `<caso_sensible>` | Protocolo ante caso sensible | rule `caso-sensible` |
| `<captacion>` | Captación del caso (funnel) | rule `captacion-caso` |
| `<categorias_habilitadas>` · `<temas_aun_no_cubiertos>` | Universo de categorías | static skill `universo-categorias` |
| `<subcategorias>` | Subcategorías de la categoría | static skill `subcategorias-laboral` |
| `<proceso_derivacion>` | Qué pasa después de captar el caso | tool skill `proceso-derivacion` |
| `<caso_recabado>` · `<contexto_usuario>` · `<contexto_temporal>` · `<estado_captacion>` | Bloques volátiles (brief / nombre del usuario / fecha actual / pedido de contacto ya hecho) | `instructions.ts` + `common/contexto-temporal.ts` (no vienen de una rule) |

**Anti-colisión con IDs de tools**: un tag XML NUNCA debe coincidir con el ID de una tool (`buscar-documentos`, `registrar-caso`, `asignar-clasificacion`, `corregir-clasificacion`, `guia-<id>`). El LLM puede leer un tag que se llama igual que una tool como una referencia a esa tool e intentar invocarla — la misma familia de bug que la regla "avoid the word skill" (abajo).

Detalle extendido de framing y uso de tags en `agent-prompting.md` § XML Tags.

---

## Shared Content Quality Guidelines

Estas guidelines aplican a TODO el contenido inyectado — rules y skills por igual.

### CRITICAL: Avoid the Word "skill" in Injected Content

El contenido inyectado al LLM NO debe contener la palabra "skill". El LLM puede confundir el contenido inyectado con una tool invocable y tirar errores como:

```
"Tool skill-proceso-derivacion not found"
```

| Evitar | Usar en su lugar |
|---|---|
| `# Skill: Nombre` | `# Nombre` (o el tag XML del bloque) |
| `Esta skill te orienta…` | `Esta guía te orienta…` |
| `Invocá la tool skill…` | `Invocá la herramienta…` |
| `<tool_skills_disponibles>` | `<herramientas_disponibles>` |

**Dónde "skill" SÍ está permitido:**
- Comentarios JSDoc (no se inyectan al LLM): `* SKILL: Nombre`
- Nombres de función (TypeScript): `subcategoriasLaboralSkill`, `crearSkillTools`
- IDs reales de tools: `guia-proceso-derivacion`

### No Emojis or Decorative Symbols

El contenido inyectado NO debe contener emojis, estrellas, checkmarks ni símbolos Unicode decorativos. Usá marcadores de texto plano.

| Evitar | Usar en su lugar |
|---|---|
| `⭐ RECOMENDADA` | `**[RECOMENDADA]**` |
| `✅ SÍ` / `❌ NO` | `SÍ` / `NO` (o negrita) |
| `→ Siguiente paso` (bullet decorativo) | `— Siguiente paso` |
| `🎯 Meta` | `**Meta**` |
| `paso A → paso B` (transición / pseudocódigo) | `paso A -> paso B` (ASCII) |

**Por qué:** los emojis gastan tokens, chocan con la rule de formato "sin emojis" y no agregan valor semántico para el LLM. Las flechas ASCII (`->`, `<-`) se aceptan cuando representan transiciones o flujo de datos en pseudocódigo; el carácter Unicode `→` queda reservado como decorativo y no se usa en contenido inyectado.

### Language: Rioplatense Spanish

Todo el contenido inyectado se escribe en español rioplatense:
- **vos** en indicativo: "Ofrecé", "Relevá", "Podés", "Necesitás" (no "Ofrece", "Releva", "Puedes")
- **Subjuntivo en negación = tuteante**: "no adelantes", "no prometas", "no menciones" (no el voseante "no adelantés", "no prometás", "no mencionés"). Ambas son válidas en culto rioplatense, pero el proyecto convergió al tuteante por consistencia — una sola forma canónica hace detectable la regresión y evita que el LLM espeje la forma más reciente de su contexto. **Nota**: aplica solo al imperativo negativo en subjuntivo; el indicativo voseante queda (`vos no podés`, `no tenés acceso`).
- Convenciones uruguayas y terminología legal uruguaya
- Tono natural, no académico ni formal

### Content Voice: Knowledge FOR the Agent

El contenido lo lee el AGENTE vendedor, no el consultante. El agente lo usa como conocimiento para hacer su trabajo — no lo recita textual.

| Agente | El contenido debe aportar | El contenido NO debe ser |
|---|---|---|
| `recepcion` | Patrones de escucha y clasificación, qué señales mirar para ubicar la consulta | Guiones literales para decirle al consultante |
| `laboral` | Criterios para dimensionar un caso, qué datos releva un abogado, errores comunes del consultante, cómo apoyarse en el corpus | Respuestas cerradas ni libretos palabra por palabra |

**Error común**: escribir el contenido como un guion literal para el consultante:

```
// MAL: guion para el consultante (lo que el agente "diría")
Paso 1: "Hola, ¿en qué te puedo ayudar?"
Paso 2: preguntá la fecha del despido
Paso 3: preguntá el salario

// BIEN: conocimiento de práctica que el agente aplica
Para dimensionar un despido, un abogado necesita antigüedad, salario y forma de despido.
Relevá esos datos a medida que la conversación los toque — sin interrogar ni seguir un orden fijo.
```

**Test**: si el contenido se lee como un libreto que el agente le recitaría al consultante, está escrito para la audiencia equivocada. Reescribilo como criterio de práctica que el agente aplica.

### The Goldilocks Principle

Encontrá el balance entre dos modos de falla:

| Demasiado rígido | Demasiado vago |
|---|---|
| "Paso 1: preguntá la fecha del despido. Paso 2: preguntá el salario. Paso 3: …" | "Tené en cuenta el contexto del caso." |

**La altitud correcta**: dar **heurísticas** — guías flexibles que el agente adapta al contexto. Específicas para guiar el comportamiento, generales para tolerar variación.

```
// Mal: receta rígida
"Paso 1: preguntá la fecha del despido. Paso 2: preguntá el salario. Paso 3: preguntá la antigüedad."

// Mal: vaguedad
"Tené en cuenta el contexto del caso."

// Bien: heurística con razón
"Relevá los datos que un abogado necesita para evaluar un despido — antigüedad, salario, forma —
a medida que la conversación los toque, sin interrogar. Un consultante que siente un interrogatorio
se cierra; uno que siente que lo escuchan, cuenta más."
```

### Motivate Instructions (the "why")

Cada recomendación debe incluir POR QUÉ importa. Las instrucciones con motivación rinden significativamente mejor que las directivas peladas.

```
// Mal: directiva pelada
"NUNCA prometas plazos de contacto."

// Bien: directiva + motivación
"NUNCA prometas plazos de contacto — no están definidos y una promesa incumplida
destruye la confianza que sostiene la conversión."
```

### Minimal but Sufficient

Cada oración tiene que ganarse su lugar. Apuntá al conjunto mínimo de información que describe completamente el comportamiento esperado — mínimo NO significa corto, pero cada línea debe agregar valor que el modelo no tiene ya.

**Una idea = una vez.** Repetir la misma instrucción con otras palabras NO la refuerza — la diluye. El modelo interpreta cada variante como una instrucción distinta, y el contenido redundante compite por la atención con las instrucciones nuevas.

```
// Mal: la misma idea 3 veces
- Pedile al consultante la antigüedad en el trabajo
- Es importante saber hace cuánto trabajaba la persona
- El tiempo trabajado es un dato clave para dimensionar el caso

// Bien: una vez, con el porqué
- Relevá la antigüedad — junto con salario y forma de despido, es lo que un abogado
  necesita para dimensionar el reclamo
```

- No definas conceptos que el modelo ya conoce ("Un despido es la extinción del vínculo laboral por decisión del empleador…")
- No repitas la misma idea con otras palabras
- No incluyas relleno introductorio ("En esta sección vamos a ver…")
- SÍ incluí conocimiento específico de Uruguay / de la práctica legal local que el modelo no tiene

**Redundancia cross-file:** las rules siempre activas se combinan al tope de cada prompt de agente. Antes de agregar contenido a una rule siempre activa, buscá en `src/mastra/dominios/*/rules/` contenido similar — si una rule relacionada ya lo dice, consolidá en vez de duplicar.

**Alcance por agente:** si una rule gobierna la comunicación de tools pero un agente no tiene tools, no incluyas ese agente en el `CONTENT`. Cada entrada del `CONTENT` suma al system prompt de ese agente — una rule que no aplica gasta tokens y diluye foco.

### Example Quality

Cuando incluyas `<ejemplos>`, seguí estos principios:

- **Diversos**: 2-3 ejemplos canónicos que cubran situaciones distintas, no una lista de edge cases
- **Concretos**: nombres reales, diálogo específico, números exactos — no placeholders abstractos
- **Representativos**: cada ejemplo ilustra un principio, no solo muestra un formato

```
// Mal: placeholder abstracto
"Ejemplo: un caso de despido de un trabajador."

// Bien: concreto e ilustrativo
"Ejemplo: un trabajador con 6 años de antigüedad, despedido sin causa y sin liquidación.
Datos a relevar: fecha del despido, último salario nominal, si le pagaron algo al desvincularlo.
Con esos tres, un abogado dimensiona el reclamo por despido."
```

### Avoid Time-Sensitive Information

Lo que vence NO vive en el prompt. Leyes, montos, plazos normativos y jurisprudencia cambian: viven en el **RAG re-ingestable** (`pnpm ingest`), nunca hardcodeados en una skill o rule. Una skill solo puede **referir el concepto** y mandar a `buscar-documentos` a traer el texto vigente con su fuente.

| Evitar (en skill/rule) | Usar en su lugar |
|---|---|
| "El plazo para reclamar es de 1 año" | "El plazo de reclamo lo fija la norma vigente — traelo del corpus con `buscar-documentos` y fundá tu respuesta en ese texto" |
| "La indemnización es de X salarios" | Referir el concepto ("la indemnización por despido se calcula sobre antigüedad y salario") y buscar el detalle en el RAG |
| "A partir de 2026, la ley Y…" | (nada: el texto normativo vive en el RAG, con su fuente y fecha de vigencia) |

Motivo: una cita hardcodeada no se actualiza cuando cambia la ley y esquiva la regla "SIEMPRE fundar en el corpus". Este es el corolario legal del principio "sin información temporal".

### Content per Agent Pattern

Rules y skills pueden dar contenido distinto por agente con el objeto `CONTENT` / `content`:

```typescript
// Static skill / rule
const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<mision>…</mision>`,
  laboral: `<rol>…</rol>`,
};

export function miRule(readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
```

```typescript
// Tool skill
export const miSkillDef: SkillToolDefinition = {
  id: "mi-guia",
  description: "… Muy útil cuando: …",
  content: {
    laboral: `<mi_guia>…</mi_guia>`,
  },
};
```

Si una rule/skill no aplica a un agente, simplemente no incluyas su `AgentId` en el objeto.

### Title Rules

- El bloque va envuelto en su tag XML — no en un heading `# Skill: …` ni `# Rule: …`.
- El tag no lleva el nombre del agente (`<rol>`, no `<rol_laboral>`).

---

## Checklist for All Injected Content

- [ ] El contenido NO usa la palabra "skill"
- [ ] Escrito en español rioplatense (vos en indicativo; subjuntivo en negación = tuteante: "no adelantes", no "no adelantés")
- [ ] Escrito PARA el agente (conocimiento que aplica), no como guion literal para el consultante
- [ ] Sigue el principio Goldilocks (heurísticas, ni recetas ni vaguedades)
- [ ] Las recomendaciones clave incluyen el PORQUÉ (motivación)
- [ ] Sin definiciones que el modelo ya conoce, sin relleno
- [ ] Una idea = una vez (sin reformulaciones redundantes)
- [ ] Ejemplos concretos y diversos (2-3 canónicos)
- [ ] Sin información temporal (fechas, números de versión)
- [ ] Sin citas normativas embebidas (eso va al RAG)
- [ ] Sin emojis ni símbolos decorativos
- [ ] El bloque va en su tag XML (sin prefijo "# Skill:", sin nombre de agente en el tag)
- [ ] Solo versiona para los agentes donde genuinamente aporta
