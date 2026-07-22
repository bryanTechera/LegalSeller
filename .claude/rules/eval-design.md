# Eval Design

Guidelines para diseñar evaluaciones, scorers, y el loop entre evals y mejora de prompts en LegalSeller. Guía dev-facing.

> **Sources**: [Hamel Husain & Shreya Shankar - LLM Evals FAQ (2026-01)](https://hamel.dev/blog/posts/evals-faq/) · [Shankar et al. - Who Validates the Validators? (UIST 2024)](https://arxiv.org/abs/2404.12272) · [Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge (NeurIPS 2024)](https://llm-judge-bias.github.io/) · [Cameron R. Wolfe - Using LLMs for Evaluation](https://cameronrwolfe.substack.com/p/llm-as-a-judge) · [Eugene Yan - Evaluating LLM-Evaluators](https://eugeneyan.com/writing/llm-evaluators/) · [Rubric Is All You Need (ACM ICER 2025)](https://dl.acm.org/doi/10.1145/3702652.3744220)
> Adaptada al proyecto LegalSeller desde las guías del proyecto colar.

---

## When this applies

**Estado actual del proyecto:** el único gate de evals es **programático** — el matcher de tool-calls del receptor en `backend/src/test/run-evals.ts` (`pnpm evals`), que corre el golden set de clasificación contra `asignar-clasificacion` y falla si la precisión cae por debajo de `THRESHOLD = 0.9`. **No hay scorers LLM-as-judge todavía**: no se juzga calidad de respuesta con otro LLM porque aún no hay corpus legal cargado sobre el cual haya "calidad de respuesta" que medir.

**Cuándo esta guía entra en juego:** cuando un documento del equipo legal traiga contenido que exija **juzgar calidad de respuesta** — fidelidad de una cita al corpus, no-fabricación de artículos/plazos, calidad de la conversación de venta — se crean scorers LLM-as-judge siguiendo esta guía. El patrón de infra para esos scorers (`createScorer` de `@mastra/core/evals` + factory `makeLLMScorer`, juez = modelo lite barato) está esbozado en `docs/guia-codificacion-backend.md § 9`; esta guía cubre el **diseño** de esos scorers, no su cableado.

Aplicá esta guía cuando vayas a:
- Crear o modificar un scorer LLM-as-judge (cuando existan).
- Promover un scorer informativo a gated (con threshold).
- Diseñar un dataset de eval nuevo.
- Hacer error analysis sobre fallas de agentes.
- Optimizar prompts cuyo desempeño se mide con scorers.

Para validate-during-conversation patterns (el agente valida antes de responder), ver `agent-prompting.md § Feedback Loops`.

---

## LLM-as-judge: known biases

Cuando un LLM evalúa la salida de otro LLM (LLM-as-judge), el judge introduce sesgos sistemáticos que distorsionan los scores. Documentar estos sesgos es prerequisito para confiar en cualquier scorer gated.

### Los 5 sesgos sistemáticos

**1. Position bias.** En evaluaciones pairwise (A vs B), el judge prefiere consistentemente la posición A o la B, independiente del contenido. *Mitigación:* evaluar ambos órdenes y promediar (position switching).

**2. Length bias.** Los judges prefieren respuestas largas. Esto castiga directamente la regla del proyecto "sintetizá 1-2 fuentes, no vuelques todo" (`agent-prompting.md § Synthesis Over Dump`, § Limiting Options). *Mitigación:* anchor explícito en la rubric sobre concisión, o normalizar por longitud.

**3. Self-preference / family bias.** El judge sube el score a outputs de su propia familia de modelos. *Mitigación:* multi-judge ensemble (rotar judges entre familias) o cross-family judge cuando hay paridad.

**4. Verbosity / authoritativeness bias.** Los judges prefieren respuestas con tono confiado y declarativo, aún cuando el contenido sea menos preciso. Peligroso en dominio legal: una respuesta que suena segura pero afirma un plazo inexistente NO debe ganarle a una fiel al corpus que aclara sus límites. *Mitigación:* rubric con anchor en exactitud factual y en fidelidad al texto recuperado, no en confianza retórica.

**5. Scoring inflation / overconfidence.** El pointwise scoring tiende a comprimirse hacia el extremo alto del rango (sobreuso de scores 0.8-1.0). *Mitigación:* pairwise > pointwise para criterios subjetivos; en pointwise, definir anchor levels específicos por valor.

### Advertencia: family bias si el judge es Gemini

Los agentes de LegalSeller corren `google/gemini-3-flash` (`crearAgente`). **Si el primer scorer LLM-as-judge se implementa con un juez Gemini** (ej. el "lite más barato" que sugiere `guia-codificacion-backend.md § 9`, que es Gemini), el setup queda **same-family** y aparece family bias tipo libro de texto:

- Los scores absolutos de ese scorer estarán **inflados** respecto a un setup cross-family.
- Comparar dos versiones de un prompt (ambas Gemini) es semi-confiable porque el sesgo aplica parejo a ambas — el **delta** sobrevive aunque el absoluto esté inflado.
- Si algún día se prueba un agente de otra familia (`anthropic/claude-*`, `openai/*`), sus scores bajarían 10-30pp por la mera salida del family bias, **no** por degradación real. No leas ese delta como regresión.

### Mitigaciones priorizadas

1. **Calibration set humano antes de gatear.** Antes de promover un scorer informativo a gated, anotá manualmente N items y medí Cohen's κ entre humano y judge; exigí **κ ≥ 0.6** para acotar la confiabilidad del scorer. Sin esto no se puede separar señal de family bias, y un gate sobre un scorer no calibrado bloquea deploys por ruido.
2. **Position switching en pairwise.** Si se introducen scorers pairwise, evaluar A→B y B→A y promediar.
3. **Multi-judge ensemble cuando sea posible.** Un segundo judge cross-family (Claude o GPT) sobre un sub-conjunto de items para detectar drift de family bias.
4. **Reportar CI 95% en lugar de single number.** Evita que una regresión a 90% se confunda con ruido cuando la varianza histórica es ±5pp.

> Sources: [Justice or Prejudice? (NeurIPS 2024)](https://llm-judge-bias.github.io/) · [A Systematic Study of Position Bias in LLM-as-a-Judge (IJCNLP 2025)](https://aclanthology.org/2025.ijcnlp-long.18.pdf) · [Self-Preference Bias in LLM-as-a-Judge (arXiv 2024-10/v2 2025)](https://arxiv.org/html/2410.21819v2) · [Cameron R. Wolfe - Using LLMs for Evaluation (2024)](https://cameronrwolfe.substack.com/p/llm-as-a-judge) · [Eugene Yan - Evaluating LLM-Evaluators](https://eugeneyan.com/writing/llm-evaluators/)

---

## Eval Failure Analysis (bottom-up)

### El antipattern: "eval-driven development"

Escribir scorers para fallos imaginados antes de mirar trazas reales es el antipattern más común en eval design. La consecuencia: los scorers detectan problemas que no existen y omiten los que sí, los thresholds se calibran contra ruido, y la optimización de prompts persigue señales falsas.

> *"Eval-driven development creates more problems than it solves… you can't anticipate what will break."* — Husain & Shankar, LLM Evals FAQ (2026)

### Metodología bottom-up — 4 pasos

**1. Recolectar ~100 trazas representativas.** El número exacto depende de saturación teórica (cuando nuevas trazas dejan de revelar patterns nuevos). Diversidad importa más que cantidad: incluir happy path, edge cases conocidos (casos sensibles, categorías no habilitadas), y trazas de la cola larga.

**2. Open coding.** Para cada traza, anotá el **primer fallo upstream** con notas libres en lenguaje natural. Solo el primer fallo: cuando un agente falla en el paso 2, los pasos 3-5 fallan en cascada y son consecuencia, no causa raíz. Mezclarlos enmascara la señal.

Ejemplo de notas:
- "El agente afirmó un plazo de reclamo sin haberlo traído de buscar-documentos — inventó el número"
- "El receptor clasificó como despido sin que el relato lo determinara — debió preguntar"
- "El agente derivó el caso sin haber registrado el contacto con registrar-caso"
- "El agente mencionó 'completá el formulario' — rompió la cuarta pared de la UI"

**3. Axial coding.** Clusterá las notas en buckets nombrados. Esto produce la **failure taxonomy** del proyecto. Buckets típicos del dominio:
- Fabricación legal (inventar artículo/plazo/monto que no está en el corpus)
- Afirmación sin respaldo (afirmar sin pasar por buscar-documentos, o extender el texto recuperado más allá de sus condiciones)
- Clasificación errónea o prematura (clasificar sin señal suficiente; no preguntar cuando debía)
- Captación omitida (avanzar/derivar sin registrar el caso)
- Ruptura de cuarta pared (referencia a la interfaz)

**4. Recién entonces escribir scorers.** Cada scorer detecta uno o más buckets de la taxonomía. Los criterios del scorer salen del open coding (notas reales), no de teoría a priori. Esto cierra el loop:

```
Trazas → Open coding → Axial coding → Scorers → Thresholds
```

### El loop "Define → Test → Diagnose → Fix"

Para cada iteración de mejora de prompts:

- **Define** — formalizá la hipótesis del cambio (ej. "agregar la regla de anclar toda cita a buscar-documentos reduce la fabricación legal").
- **Test** — corré evals con la versión nueva (`pnpm evals`).
- **Diagnose** — error analysis sobre las trazas fallidas (open coding sobre el delta).
- **Fix** — ajustá el prompt según el diagnóstico, no según el score agregado.

Iterá hasta que el delta sea estable (varianza ≤3pp en 2-3 runs).

### Diferenciación con § Feedback Loops

Esta sección y `agent-prompting.md § Feedback Loops` cubren cosas distintas:

- **Eval Failure Analysis (acá):** validate-on-traces. Análisis post-hoc sobre conversaciones cerradas. Output: failure taxonomy + scorers + threshold updates.
- **Feedback Loops (allá):** validate-during-conversation. El agente valida sus afirmaciones contra `buscar-documentos` antes de responderle al usuario. Output: corrección en tiempo real.

Las dos son complementarias: los feedback loops mejoran lo que el agente produce ahora; el failure analysis mejora la guidance que el agente recibe la próxima vez.

> Sources: [Hamel Husain & Shreya Shankar - LLM Evals FAQ (2026-01)](https://hamel.dev/blog/posts/evals-faq/) · [Shankar et al. - Who Validates the Validators? (UIST 2024)](https://arxiv.org/abs/2404.12272)

---

## Writing prompts for judges/scorers

El prompt que recibe un judge LLM determina la calidad del scorer tanto o más que la elección del modelo. Cuatro principios.

### 1. Pairwise > pointwise para criterios subjetivos

El pointwise scoring (judge devuelve un score 0-1) sufre de scoring inflation y baja inter-run consistency en criterios subjetivos como "calidad de la conversación de venta" o "voz consultante-facing".

El pairwise (judge compara A vs B) tiene menos drift entre runs porque el judge solo decide cuál es mejor, no cuánto. Trade-off: pairwise requiere ~N×(N-1)/2 comparaciones para ranquear N opciones, pero para CI comparando dos versiones del prompt, el costo es N (un solo round por item).

**Cuándo cada uno:**
- Pointwise: criterios objetivos con ground truth claro (una afirmación corresponde textualmente al texto del corpus; detección de caso sensible; clasificación correcta).
- Pairwise: criterios subjetivos sin referencia (calidad de venta, empatía, claridad de la explicación llana).

### 2. Anchor levels en rubric

En pointwise, no uses un continuum 0-1 ambiguo. Definí anchor levels con descriptores observables:

```
- 0.0 — Falla completa: el criterio no se cumple en absoluto (afirma un plazo/artículo que no está en el corpus).
- 0.33 — Cumple parcial pero con omisiones críticas: el dato está en el texto recuperado pero omite las condiciones que lo limitan (generaliza una consecuencia condicionada).
- 0.67 — Cumple con omisiones menores: fiel al texto recuperado pero parafrasea el texto normativo.
- 1.0 — Cumple completamente: fiel al texto recuperado, con sus condiciones e hipótesis.
```

> *"Question-specific rubrics improve human alignment significantly more than generic continuous scales."* — Rubric Is All You Need (ICER 2025)

Cada nivel debe ser distinguible por un humano leyendo solo la rubric. Si dos niveles requieren juicio interpretativo, colapsan en uno.

### 3. Sampling temp > 0

Contra-intuitivamente, el **sampling no determinístico** (temp > 0) en el judge mejora el alignment con humanos vs determinístico. La paradoja: el "ruido" del judge a temp > 0 correlaciona con la consistencia humana mejor que la decisión "óptima" determinística. Setting recomendado para judges: temp 0.3-0.7 (no 0 ni 1).

### 4. NO CoT-padding cuando la rubric es clara

Agregar "pensá paso a paso" antes del score NO mejora la consistency cuando la rubric tiene anchor levels claros. El CoT introduce ruido (racionalizaciones que justifican un score predeterminado) sin ganar precisión.

Cuándo SÍ usar CoT en judge prompts:
- Rubrics complejas con múltiples dimensiones que el judge debe combinar.
- Criterios donde el reasoning es parte del score (ej. "el agente justifica por qué deriva el caso").

Cuándo NO:
- Rubrics simples con anchor levels.
- Criterios binarios (afirmación con respaldo del corpus / sin respaldo).

> Sources: [Cameron R. Wolfe - Using LLMs for Evaluation (2024)](https://cameronrwolfe.substack.com/p/llm-as-a-judge) · [Rubric Is All You Need (ACM ICER 2025)](https://dl.acm.org/doi/10.1145/3702652.3744220) · [An Empirical Study of LLM-as-a-Judge (arXiv 2025-06)](https://arxiv.org/html/2506.13639v1) · [Eugene Yan - Evaluating LLM-Evaluators](https://eugeneyan.com/writing/llm-evaluators/)

---

## See also

- `agent-prompting.md § Feedback Loops` — validate-during-conversation (el agente valida contra `buscar-documentos` antes de responder).
- `rules-and-skills-taxonomy.md` — qué va a RAG / skill / rule, y calidad del contenido inyectado.
- `backend/src/test/run-evals.ts` — el gate programático actual (matcher de tool-calls, threshold 0.9).
- `docs/guia-codificacion-backend.md § 9` — infra de evals del proyecto (runner, scorers, quality gates).
