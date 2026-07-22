# Agent Prompting Best Practices

Guidelines for writing effective system prompts (instructions) for Mastra agents in the LegalSeller project. Guía dev-facing: NO se inyecta a los agentes — gobierna cómo escribimos rules y skills.

> **Sources**: [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) · [Claude 4 Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices) · [Prompt Engineering Overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview) · [Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) · [Proactive Agent (ICLR 2025)](https://arxiv.org/abs/2410.12361) · [Beyond Reactivity (2025)](https://arxiv.org/html/2510.19771v1)
> Adaptada al dominio legal de LegalSeller desde las guías del proyecto colar. Docs de referencia (copias verbatim de Anthropic) en `docs/prompt-engineering/`. Taxonomía y calidad de contenido inyectado en `rules-and-skills-taxonomy.md`; ensamblado del prompt en `prompt-assembly.md`.

---

## Core Principles

### Be Explicit with Instructions

Gemini 3 y Claude 4.x responden bien a instrucciones claras y explícitas. Ser específico sobre el output deseado mejora los resultados.

```text
// Menos efectivo
Respondé la duda del consultante.

// Más efectivo
Respondé la duda del consultante fundándola en el texto que devolvió buscar-documentos,
integrado como conocimiento propio (sin nombrar documentos internos), explicá en lenguaje
llano sin tecnicismos, y una vez que demostraste entender el caso ofrecé dimensionarlo
para derivarlo a un abogado de la red.
```

### Add Context to Improve Performance

Dar la motivación detrás de una instrucción ayuda al modelo a entender el objetivo.

```text
// Menos efectivo
NUNCA uses viñetas.

// Más efectivo
Tu respuesta la lee un consultante preocupado por su situación laboral. Escribí en
prosa cálida y clara, en párrafos que expliquen el concepto, no fragmentando la
información en viñetas sueltas que suenan a formulario.
```

### Be Vigilant with Examples & Details

Los modelos actuales prestan mucha atención a los ejemplos y detalles. Asegurate de que cada ejemplo ilustre exactamente el comportamiento que querés fomentar — un ejemplo desalineado enseña el patrón equivocado con más fuerza que una instrucción en prosa.

---

## System Prompt Structure & Ordering

Poné el contenido estable y de referencia (identidad, rol, conocimiento) **al principio** del prompt, y las directivas de comportamiento y los bloques volátiles **al final**. El modelo presta más atención al contenido cercano al final del system prompt: las instrucciones ubicadas después de la referencia reciben adherencia más fuerte que las enterradas antes de bloques grandes de contexto.

**Orden del proyecto** (definido por el orden de registración en `rules/index.ts` y `skills/index.ts`; el ensamblado real está en `prompt-assembly.md`):

```
1. rules.inicio        <- identidad, rol, misión, conducta (estable, cache implícito de Gemini)
2. static skills       <- conocimiento (subcategorías, universo de categorías)
3. rules.final         <- captación del caso (posicion: "final") — recencia
4. bloques volátiles   <- <caso_recabado>, <contexto_usuario> — último
```

**Composición** (esquemática — la real vive en `dominios/<dominio>/instructions.ts` sobre `ActivationRegistry.execute`):

```typescript
const { inicio, final } = rulesRegistry.execute(readOnly, agentId);
const skills = staticSkillsRegistry.execute(readOnly, agentId).inicio;

return [
  inicio,            // rules estables primero
  skills,            // conocimiento en el medio
  final,             // rules con posicion:"final" (captación) — recencia
  bloquesVolatiles,  // <caso_recabado>, <contexto_usuario> — último
].filter(Boolean).join("\n\n");
```

**Por qué importa:** Gemini y Claude exhiben recency bias — las directivas de comportamiento ubicadas después de la referencia reciben más adherencia que las que quedan sepultadas antes del conocimiento.

### Attention Bias: Lost in the Middle

Los LLM exhiben atención en U: el contenido al principio (primacy) y al final (recency) del prompt recibe significativamente más atención que el del medio. El efecto es más fuerte cuando el input ocupa hasta 50% de la ventana de contexto.

**Implicaciones para nuestro sistema:**

- Las rules críticas de identidad y safety (`identidad-jurco`, `caso-sensible`) quedan en primacy: primeras en el orden de registración.
- Las static skills (conocimiento: `subcategorias-laboral`, `universo-categorias`) van en el medio — mantenelas comprimidas para minimizar la "zona muerta".
- La captación (`captacion-caso`, `posicion: "final"`) queda en recencia: es la directiva de comportamiento que dispara el funnel, y llega al modelo justo antes de responder.
- Los bloques volátiles (`<caso_recabado>`, `<contexto_usuario>`) se inyectan al final, después de las rules `final`.
- Al agregar contenido nuevo, ubicalo en el medio salvo que regule un comportamiento crónicamente violado (entonces va en primacy) o sea la directiva que dispara la acción del turno (entonces va en recencia).

> Sources: "Lost in the Middle" (Stanford/UW, 2023), "Exploiting Primacy Effect" (2025), Gemini 3 Prompting Guide

---

## XML Tags for Structure

Los tags XML ayudan al modelo a parsear el prompt con más precisión, produciendo outputs de mayor calidad.

### Why Use XML Tags

- **Clarity**: separan claramente las partes del prompt.
- **Accuracy**: reducen errores por mala interpretación.
- **Flexibility**: encontrar, agregar, quitar o modificar partes es más fácil.

### Best Practices

1. **Sé consistente**: usá el mismo nombre de tag en todo el proyecto.
2. **Anidá tags**: `<outer><inner></inner></outer>` para contenido jerárquico.
3. **Referí los tags**: nombralos al hablar de su contenido (ej. "usando el contexto en `<contexto_usuario>`...").

### Avoid Tool Name Collisions

Un tag XML NUNCA debe coincidir con el ID de una tool. El modelo puede leer un tag que se llama igual que una tool como una referencia a esa tool e intentar invocarla — la misma familia de bug que la regla "avoid the word skill" (`rules-and-skills-taxonomy.md`).

IDs de tools registradas (no usar como tags): `buscar-documentos`, `registrar-caso`, `asignar-clasificacion`, `corregir-clasificacion`, y las tool-skills publicadas como `guia-<id>` (ej. `guia-proceso-derivacion`).

```xml
<!-- Mal: el tag coincide con el ID de una tool -->
<registrar-caso>...</registrar-caso>

<!-- Bien: tag distinto del ID de la tool -->
<caso_recabado>...</caso_recabado>
```

### Tags canónicos del proyecto

El proyecto **no** envuelve rules/skills en un wrapper de capa: cada bloque lleva su propio tag XML en español dentro de su `CONTENT` (decisión del spec; preserva byte a byte los prompts verificados en vivo). La tabla completa y su origen viven en `rules-and-skills-taxonomy.md § Convención de tags XML`. Resumen:

| Tag | Bloque |
|---|---|
| `<personalidad>` | Identidad y voz del asistente |
| `<rol>` | Rol del especialista de categoría |
| `<mision>` | Misión del receptor |
| `<reglas>` | Reglas de conducción / conducta |
| `<caso_sensible>` | Protocolo ante caso sensible |
| `<captacion>` | Captación del caso (funnel) |
| `<categorias_habilitadas>` · `<temas_aun_no_cubiertos>` | Universo de categorías |
| `<subcategorias>` | Subcategorías de la categoría |
| `<proceso_derivacion>` | Qué pasa después de captar el caso |
| `<caso_recabado>` · `<contexto_usuario>` · `<contexto_temporal>` | Bloques volátiles (brief / nombre del usuario / fecha actual) |

**Reglas de tags:** en español; self-documenting (que alguien no técnico intuya su significado); no colisionan con IDs de tools; el tag no lleva el nombre del agente (`<rol>`, no `<rol_laboral>`). Si un bloque tiene una única sección sin sub-estructura, alcanza con el tag canónico; si necesitás sub-secciones que el modelo deba distinguir, anidá tags en español snake_case dentro del canónico.

---

## Positive Framing

Enmarcá las instrucciones como lo que HAY que hacer, no lo que NO hay que hacer. El framing negativo obliga al modelo a inferir el comportamiento correcto; el positivo lo dice directo.

| Negativo (evitar) | Positivo (preferir) |
|---|---|
| "NO uses viñetas" | "Respondé en prosa fluida, con párrafos completos" |
| "NO listes todos los resultados del corpus" | "Sintetizá 1-2 fuentes relevantes y recomendá" |
| "NO le digas al usuario que complete un formulario" | "Registrá el dato directamente con `registrar-caso` apenas aparezca" |
| "NO inventes plazos ni artículos" | "Afirmá SOLO lo que devolvió `buscar-documentos`, con las condiciones que el texto le pone" |

**Excepción:** las prohibiciones absolutas (`NUNCA`) son apropiadas para reglas críticas donde el costo de violación es alto — safety e integridad legal:

```xml
<reglas>
NUNCA des asesoramiento legal personalizado definitivo — orientás y derivás, no dictaminás.
NUNCA inventes contenido legal (artículos, plazos, montos) que no exista en el corpus; traelo con buscar-documentos y fundá tu respuesta en ese texto.
NUNCA referencies elementos de la interfaz (formulario, botón, "acá abajo").
</reglas>
```

**Cuando hace falta una restricción**, apareala con el comportamiento correcto:

```xml
<!-- Mal: solo dice qué no hacer -->
<regla>No des muchas opciones al usuario.</regla>

<!-- Bien: restricción + comportamiento correcto -->
<regla>En vez de listar todo lo que encontraste, recomendá lo más pertinente con
justificación breve. Si hay una alternativa razonable, mencionala en una línea.</regla>
```

---

## Instruction-Following in Modern Models

Gemini 3 y Claude 4.x son **más** responsivos al system prompt que sus predecesores. Tres consecuencias prácticas con evidencia oficial.

### Bajá el lenguaje agresivo para triggering de tools/skills

`CRITICAL: DEBÉS usar esta tool…` causa **over-triggering** en modelos nuevos, no mejor adherencia. Anthropic textual: *"dial back any aggressive language. Where you might have said 'CRITICAL: You MUST use this tool when…', you can use more normal prompting like 'Use this tool when…'."* Reservá `NUNCA`/`SIEMPRE`/`CRITICAL`/mayúsculas para safety e integridad legal (donde el costo de violación es alto); para triggering de tools/skills usá lenguaje normal.

| Evitar (over-triggers) | Usar en su lugar |
|---|---|
| `CRITICAL: SIEMPRE consultá buscar-documentos antes de responder` | `Consultá buscar-documentos cuando la respuesta necesita una cita del corpus` |
| `NUNCA omitas asignar-clasificacion` | `Llamá asignar-clasificacion en cuanto tengas confianza suficiente` |

> Source: [Claude 4.x best practices — "More literal instruction following"](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

### Declará el scope explícito

Los modelos nuevos **no generalizan instrucciones implícitamente**. Una instrucción que el modelo viejo "extendía" a casos análogos ahora se aplica solo literalmente.

```xml
<!-- Mal: el modelo verifica solo la primera afirmación -->
<instruccion>Fundá la afirmación legal en el texto recuperado.</instruccion>

<!-- Bien: scope explícito -->
<instruccion>Fundá CADA afirmación basada en el corpus en el texto que devolvió
buscar-documentos, no solo la primera.</instruccion>
```

Aplica cuando una instrucción debe cubrir múltiples casos (cada afirmación citable, cada dato del caso a registrar, cada opción presentada).

> Source: [Claude 4.x best practices — literal instruction following](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)

### Auditá contradicciones en el prompt **ensamblado**

Los modelos de razonamiento siguen instrucciones tan bien que los conflictos internos del prompt los hacen oscilar. La auditoría es **sobre el ensamblado completo** — el output de `buildDynamicInstructions` / del `instructions.ts` del dominio (rules.inicio + static skills + rules.final + bloques volátiles) — **no sobre cada rule aislada**. Ahí es donde aparecen las contradicciones: dos rules coherentes por separado pueden pedir cosas incompatibles una vez concatenadas.

Ejes típicos de conflicto:

- **Concisión vs completitud**: una rule dice "sintetizá 1-2", una skill dice "explicá cada punto con detalle".
- **Proactividad vs preguntar**: una rule dice "registrá el dato apenas aparezca", otra dice "confirmá siempre antes de registrar".
- **Umbrales de tool use**: una rule desalienta `buscar-documentos` para dudas simples, otra lo exige para toda afirmación legal.

OpenAI lo dice textual: *"clarify conflicting rules, remove redundant or contradictory lines"* — porque los modelos nuevos *intentan satisfacer ambas* y oscilan en vez de elegir. Esto es **distinto de la redundancia** (que diluye); la contradicción rompe el comportamiento de manera no determinística.

**Cómo auditar:** cuando agregás una rule/skill nueva, grepeá las always-active y las de `posicion:"final"` por el comportamiento que estás regulando, y leé los párrafos vecinos — no solo el match literal. Si encontrás dos directivas que el agente no podría cumplir a la vez, una de las dos sobra.

> Source: [OpenAI GPT-5.1 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide)

---

## Multishot Prompting (Examples)

Los ejemplos sirven para **fijar formato, voz y estructura** (voseo, tono cálido, cómo integrar el respaldo normativo, cómo cerrar hacia la captación). En modelos con thinking **no enseñan a razonar**: si el ejemplo prescribe el contenido del razonamiento (qué categoría elegir, qué justificación dar), sesga al modelo hacia patrones de superficie en vez de dejarlo razonar. La evidencia reciente sobre modelos de razonamiento: *"output format alignment, not additional reasoning skill, is the principal effect of demonstration"* ([arXiv 2506.14641, 2025](https://arxiv.org/html/2506.14641)).

**Regla de decisión** antes de agregar un ejemplo: ¿esto fija formato/voz (OK, agregar) o intenta enseñar el razonamiento legal (riesgoso — preferí heurística declarativa en `<instrucciones>` con motivación)?

Para constraints crónicamente violados, un **par contrastivo** dentro de `<ejemplos>` (1 mal-ejemplo etiquetado + 1 bien-ejemplo) puede ser más efectivo que dos ejemplos positivos. Limitalo a 1 par por constraint para no inflar.

### Crafting Effective Examples

- **Relevantes**: reflejan el caso de uso real (una consulta laboral concreta).
- **Diversos**: cubren situaciones distintas, no una lista de edge cases.
- **Claros**: envueltos en `<ejemplo>` (anidados en `<ejemplos>` si hay varios).
- **Formato sobre contenido**: priorizá ejemplos que muestren *cómo* responder (estructura, voz, cita), no *qué* decidir (la clasificación o la recomendación legal).

---

## Degrees of Freedom

Calibrá cuánta latitud tiene el agente según la tolerancia de la tarea a la variación.

| Task Type | Freedom | Prompt Pattern |
|---|---|---|
| Datos del corpus legal (citas, plazos normativos) | **LOW** — fiel al texto recuperado | "Fundá cada afirmación basada en el corpus en el texto devuelto por buscar-documentos, con sus condiciones. No parafrasees el texto normativo." |
| Armado del caso (qué preguntar, qué registrar) | **MEDIUM** — heurísticas adaptables | "Registrá cada dato APENAS aparezca; preguntá solo lo que no podés inferir de la conversación" |
| Conversación de venta / empatía | **HIGH** — objetivos y límites, el agente decide | "Primero aportá valor; pedí contacto cuando ya demostraste entender el caso" |

**LOW freedom** — script exacto, formato y payload; nada de paráfrasis:

```xml
<instrucciones>
Para toda afirmación normativa usá EXCLUSIVAMENTE el texto devuelto por buscar-documentos,
respetando sus condiciones e hipótesis tal cual aparecen; no parafrasees el texto legal.
</instrucciones>
```

**MEDIUM freedom** — heurística con razón, el agente adapta:

```xml
<instrucciones>
Relevá los datos que un abogado necesita para dimensionar el caso (antigüedad, salario,
forma de despido) a medida que la conversación los toca. No sigas un orden fijo ni interrogues.
</instrucciones>
```

**HIGH freedom** — objetivos y límites, el agente crea:

```xml
<instrucciones>
Generá confianza aportando valor antes de pedir nada. Pedí el contacto recién cuando ya
demostraste entender el caso — el momento lo decidís vos según cómo fluye la conversación.
</instrucciones>
```

---

## Thinking Configuration

Los agentes corren `google/gemini-3-flash` vía `@ai-sdk/gateway`. La config está centralizada en `crearAgente` (`common/crear-agente.ts`) y hoy es deliberadamente mínima:

- **`temperature: 1` explícito.** Requerido con gateway+Gemini; bajarlo puede causar looping en Gemini 3. No lo toques por agente.
- **Provider order pineado** (`providerOptions.gateway.order = ["google", "vertex"]`) para caching implícito.
- **Sin `thinkingLevel` declarado.** Los agentes usan el default dinámico de Gemini 3 (razonamiento profundo cuando la query lo amerita). No declaramos `thinkingConfig` en ningún agente — es lo correcto para agentes conversacionales que integran contexto, clasifican y redactan.

**Notas de comportamiento Gemini 3** (relevantes porque es nuestro modelo):

- Instrucciones más cortas rinden mejor — podá agresivo; una idea = una vez.
- No mezcles XML y Markdown pesado en un mismo bloque; el proyecto usa tags XML.
- Prompts afinados para modelos anteriores producen **output inflado** en Gemini 3. Si migrás contenido de otro modelo, releé y podá el scaffolding que el modelo nuevo ya hace por default.

**Si en el futuro se agrega** un agente de routing puro (que solo delega) o un workflow en Gemini 2.5 (donde `thinkingBudget: 0` + `tools: {}` importan), la tabla extendida por tipo de agente — con `thinkingLevel`, `thinkingBudget` e `includeThoughts` — vive en la guía homóloga del proyecto colar (`agent-prompting.md § Thinking Configuration`). Hoy no aplica.

### Thinking Sensitivity

Cuando el thinking está limitado, evitá la palabra "pensá" en las instrucciones — usá "considerá", "evaluá", "determiná". (Con el default dinámico actual no es crítico, pero mantiene el hábito.)

---

## Agent Proactivity

Los agentes actúan, no solo sugieren. El agente usa sus tools para completar el trabajo en vez de pedirle al usuario que haga algo en la interfaz.

> [Proactive Agent (ICLR 2025)](https://arxiv.org/abs/2410.12361) descompone la proactividad en capacidades; [Beyond Reactivity (2025)](https://arxiv.org/html/2510.19771v1) muestra que aún modelos frontier logran solo ~40% de éxito en tareas proactivas sin instrucciones explícitas — los agentes necesitan guía explícita para ser proactivos, no lo hacen naturalmente.

**Reglas:**

- **`registrar-caso` es proactivo.** Apenas la conversación revela un dato del caso (nombre, contacto, hechos), registralo — es parte de la regla de captación, no algo que el usuario "confirma" primero. Solo preguntá lo que genuinamente no podés inferir de la conversación.
- **`asignar-clasificacion` es proactivo.** Llamalo en cuanto haya confianza suficiente, idealmente desde el primer mensaje si ya alcanza; no anuncies el paso al usuario.

**Prohibición de referencias a la interfaz** — el chat vive en el home; el agente NUNCA menciona:

| Nunca referenciar | Por qué |
|---|---|
| "formulario", "campo", "casilla" | Detalle de implementación de UI |
| "botón", "hacé clic", "presioná" | Interacción de UI |
| "acá abajo", "a la derecha" | Depende del layout |
| "asistente", "interfaz", "pantalla" | Rompe la cuarta pared |
| "completá el formulario" | El agente lo hace con `registrar-caso` |
| "documento", "corpus", "PDF", títulos internos del corpus | Mecánica interna del conocimiento — las fuentes son de uso interno; ante la pregunta por el origen, la frase institucional (rule `conducta-laboral`) |

**Patrón correcto:**

```xml
<!-- Mal: manda al usuario a la UI -->
<instruccion>Pedile al usuario que complete sus datos de contacto en el formulario.</instruccion>

<!-- Bien: el agente actúa -->
<instruccion>Cuando el usuario menciona su nombre o contacto, registralo con registrar-caso.
Solo pedí lo que no podés inferir de la conversación.</instruccion>
```

---

## Feedback Loops

El agente valida sus afirmaciones contra el corpus antes de dárselas al usuario. El patrón es: **generar, validar contra el oracle, corregir, responder.**

**Validación = oracle externo, no auto-crítica.** El único oracle en este proyecto es **`buscar-documentos`** (el corpus legal): toda afirmación normativa (plazo, artículo, monto, criterio) se ancla contra el texto que devuelve la tool. "Revisá tu respuesta" o "asegurate de no haber inventado" sin referencia externa **amplifica el self-bias del modelo en vez de corregirlo** — los LLM sobrevaloran sus propias generaciones y el sesgo se amplifica con cada ronda de auto-crítica. Solo se corrigen errores que el modelo ya reconoce; los "unknown unknowns" quedan.

**Una sola pasada.** El beneficio del verifier-generator loop está en la 1ª validación contra el oracle. Más rondas no agregan corrección (solo agregan self-bias). Si la validación falla, **corregí y respondé**, no entres en un loop. Si falla repetidamente, la causa NO es resoluble con más auto-crítica — es estructural (el dato no está en el corpus, la instrucción es ambigua, la tool es inadecuada).

**Validación semántica, no solo formato.** Que una cita esté *bien formada* no basta: una afirmación con un número de artículo o un plazo plausible pero inexistente en el corpus pasa cualquier check sintáctico. **Una cita plausible pero inexistente es el peor vector de drift** — solo se detecta validando el contenido contra `buscar-documentos`. Si la tool no lo devuelve, no lo afirmes: es la regla "SIEMPRE fundar en el corpus" operacionalizada.

```xml
<verificacion>
Antes de afirmarle al usuario un plazo, artículo o monto:
1. Confirmá que buscar-documentos lo devuelve textualmente, con las condiciones e hipótesis que el texto le pone.
2. Si la tool no lo trae, no lo afirmes — decí que lo verificás y encaminá el caso a un abogado.
</verificacion>
```

---

## Synthesis Over Dump

Cuando el agente recupera resultados de `buscar-documentos`, debe **sintetizar y recomendar**, no volcar todos los chunks.

**Patrón:** recuperar → analizar → sintetizar 1-2 fuentes relevantes con su recomendación → ofrecer profundizar si hace falta.

```xml
<!-- Mal: vuelca todos los resultados -->
<instruccion>Mostrale al usuario los fragmentos que encontró buscar-documentos.</instruccion>

<!-- Bien: sintetiza y cita -->
<instruccion>De los resultados de buscar-documentos, elegí 1-2 fuentes relevantes y explicá
qué implican para el caso, integrándolas como conocimiento propio. Ofrecé profundizar si le interesa.</instruccion>
```

**Por qué importa:** un consultante preocupado no quiere leer diez fragmentos normativos y evaluarlos — eso es trabajo del agente. Una respuesta curada, con el dato justo y la implicación clara, genera confianza y sostiene el funnel.

## Limiting Options

Al presentar opciones, dá 2-3 máximo con un default recomendado. Evitá la parálisis de decisión.

**Reglas:**

- Recomendá la opción más relevante con justificación.
- Mencioná 1-2 alternativas solo si sirven a un propósito distinto.
- Si el usuario no expresó preferencia, decidí por él y explicá el criterio.
- Nunca vuelques listas exhaustivas de fuentes, categorías o subcategorías.

---

## Terminology Consistency

Usá términos consistentes en todas las rules y skills. La terminología inconsistente confunde tanto al modelo como al usuario. El glosario de práctica es la tabla de abajo.

| Concepto | Usar siempre | Nunca |
|---|---|---|
| Persona que consulta | consultante (en prompts: "el usuario") | cliente, lead |
| Caso captado (lead) | caso | ticket, oportunidad |
| Área del derecho | categoría | dominio, rama |
| Tipo de consulta dentro del área | subcategoría | subtipo, tema |
| Pasaje a un abogado | derivación | escalamiento, transferencia |
| Profesional de la red | abogado de la red | partner, profesional asociado |

---

## Format Control

### Minimize Markdown Overuse

La respuesta la lee un consultante, no un desarrollador. Escribí en prosa clara, con párrafos completos. Reservá markdown para lo mínimo (una cita textual, un dato puntual). Evitá `**negrita**`, `*itálica*` y listas salvo que sean genuinamente necesarias — incorporá la información en oraciones.

### Match Prompt Style to Output

El estilo de formato del prompt influye en el estilo de la respuesta. Si querés menos markdown en el output, usá menos markdown en el prompt.

### Razonamiento antes del resultado

En todo template o schema estructurado que requiera razonamiento (ej. el payload de `asignar-clasificacion`, donde el `brief` fáctico precede a la `categoria`), el **campo de análisis/justificación debe preceder al campo de selección/resultado final**.

Forzar al modelo a emitir un veredicto antes del razonamiento degrada la calidad: el modelo "ancla" en la primera respuesta y luego justifica hacia atrás. La evidencia es contundente — hasta -27pp en accuracy en tareas de razonamiento cuando el formato fuerza el output antes del razonamiento ([Let Me Speak Freely?, EMNLP 2024](https://arxiv.org/abs/2408.02442); [JSONSchemaBench, 2025](https://arxiv.org/html/2501.10868v1)).

```xml
<!-- Mal: veredicto primero, justificación después -->
<seleccion>categoria: laboral, subcategoria: despido</seleccion>
<analisis>Porque el usuario relató una desvinculación sin causa...</analisis>

<!-- Bien: razonamiento primero, veredicto al final -->
<analisis>El usuario relató una desvinculación sin causa tras 6 años...</analisis>
<seleccion>categoria: laboral, subcategoria: despido</seleccion>
```

---

## Common Mistakes

| Error | Fix |
|---|---|
| Directivas de comportamiento sepultadas antes del conocimiento | Movelas después de la referencia (recencia); la captación va con `posicion:"final"` |
| Todo enmarcado como "NO hagas X" | Reformulá como "Hacé Y en vez de X" |
| `CRITICAL`/`SIEMPRE`/mayúsculas para triggering de tools | Reservalos para safety/integridad legal; lenguaje normal para tool triggering (over-triggering en modelos nuevos) |
| Instrucción implícita para múltiples casos ("fundá la afirmación") | Declará scope explícito ("fundá CADA afirmación en el texto recuperado, no solo la primera") |
| Ejemplo few-shot que prescribe el contenido del razonamiento | Limitá ejemplos a fijar formato/voz; el razonamiento se enseña con heurística declarativa |
| Template con veredicto antes que justificación | Razonamiento primero, resultado al final (-27pp si se invierte) |
| "Revisá tu respuesta" como única validación | Anclá contra `buscar-documentos` (oracle externo); 1 sola pasada |
| Afirmar un plazo/artículo plausible pero no verificado | Si `buscar-documentos` no lo trae, no lo afirmes (drift semántico = el peor vector) |
| Volcar todos los chunks de `buscar-documentos` | Sintetizá 1-2 fuentes con su recomendación |
| Decirle al usuario "completá el formulario" | Usá `registrar-caso` directamente |
| Mezclar "consultante"/"cliente"/"lead" | Elegí un término del glosario y usalo en todos lados |
| Mismo nivel de freedom para toda tarea | Calibrá LOW/MEDIUM/HIGH por tipo de tarea |

---

## Checklist

Al escribir el prompt de un agente (rules + skills):

**Estructura y orden:**
- [ ] Contenido estable (identidad, rol, conocimiento) primero; directivas de comportamiento después (recencia)
- [ ] La captación (`posicion:"final"`) queda cerca del final; los bloques volátiles, últimos
- [ ] Rules críticas (identidad, caso sensible) en primacy

**Calidad de instrucción:**
- [ ] Framing positivo (qué hacer); `NUNCA` solo para safety e integridad legal
- [ ] Lenguaje agresivo (`CRITICAL`, mayúsculas, `SIEMPRE`) reservado para safety — no para tool/skill triggering
- [ ] Scope explícito cuando una instrucción aplica a múltiples casos (cada afirmación, cada dato del caso)
- [ ] Sin contradicciones entre la rule/skill nueva y las vecinas (auditar el ensamblado, no cada archivo)
- [ ] Cada `NUNCA` apareado con el comportamiento correcto o su motivación (el "porqué")
- [ ] Templates con razonamiento ANTES del resultado (análisis → veredicto)
- [ ] Feedback loops anclan contra `buscar-documentos`, no auto-crítica; una sola pasada
- [ ] Ejemplos few-shot fijan formato/voz, no prescriben el razonamiento
- [ ] Synthesis over dump: el agente sintetiza 1-2 fuentes, no vuelca todo
- [ ] Opciones limitadas a 2-3 con default recomendado
- [ ] Una idea = una vez — sin reformulaciones redundantes
- [ ] Freedom calibrado por tipo de tarea (LOW/MEDIUM/HIGH)

**Idioma y formato:**
- [ ] Español rioplatense (vos en indicativo; subjuntivo en negación = tuteante: "no adelantes", no "no adelantés"). Ver `rules-and-skills-taxonomy.md § Language: Rioplatense Spanish`.
- [ ] Tags XML en español, no colisionan con IDs de tools
- [ ] Sin emojis ni símbolos decorativos
- [ ] Terminología consistente con el glosario
- [ ] Ejemplos concretos, diversos, envueltos en `<ejemplo>`
- [ ] Sin citas normativas embebidas (eso va al RAG) ni información temporal (fechas, montos, plazos)

**Comportamiento:**
- [ ] El agente nunca referencia la UI ni dice "completá el formulario"
- [ ] `registrar-caso` y `asignar-clasificacion` proactivos (registrar/clasificar apenas hay señal)
- [ ] Tool usage explícito ("Usá X" / "Llamá X cuando…"), sin lenguaje agresivo
- [ ] Rules acotadas solo a los agentes que las necesitan (sin dead-weight)

**Verificación:**
- [ ] `pnpm test` después de cambios de código
- [ ] `pnpm evals` para verificar el comportamiento del agente (ver `eval-design.md`)
