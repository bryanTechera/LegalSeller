---
name: procesar-documento-legal
description: Use cuando el equipo de expertos legales envía un documento o material nuevo — triage por pieza hacia RAG/skill/rule, comparación con lo existente, implementación y evals. También al revisar material legal ya recibido pero no procesado.
---

# Procesar documento del equipo legal

Cada documento mejora el sistema de forma iterativa: corpus RAG, conocimiento de los
agentes (skills), restricciones (rules) y evals. Este proceso es obligatorio para TODO
material nuevo del equipo legal — no se ingiere ni se copia nada sin pasar por acá.

**Anunciar al inicio:** "Procesando el documento con la skill procesar-documento-legal."

**Guías de fondo:** `.claude/rules/rules-and-skills-taxonomy.md` (destinos y calidad),
`.claude/rules/agent-prompting.md` (cómo escribir contenido inyectado),
`.claude/rules/prompt-assembly.md` (cómo registrar), `.claude/rules/eval-design.md`
(cómo medir). Leerlas antes de decidir destinos.

## Checklist (crear un todo por fase)

### Fase 1 — Lectura completa
- Leer el documento ENTERO (nunca procesar por resumen ni por título).
- Identificar las piezas: un documento casi nunca es un solo destino. Una circular
  sobre despido puede traer texto normativo (RAG), criterios prácticos del experto
  (skill) y una restricción de alcance (rule).

### Fase 2 — Triage por pieza
Para CADA pieza, en orden:
1. ¿Aporta algo que el modelo base no tiene? (definiciones genéricas de derecho → descartar)
2. ¿Aplica a jurisdicción Uruguay? (otro ordenamiento → descartar, salvo pedido explícito)
3. ¿Es citable? → **RAG**. ¿Es accionable como conocimiento? → **skill**.
   ¿Es restricción de comportamiento? → **rule**. (Litmus test en la taxonomía.)
4. Descarte = decisión documentada con motivo (fase 6), no omisión silenciosa.

**Ambigüedad legal** (¿este criterio es correcto? ¿qué alcance tiene? ¿contradice la
ley vigente?): NO asumir ni inventar — formular la pregunta concreta al equipo de
expertos legales, registrarla en el archivo enviable (fase 6) y seguir con lo no
ambiguo (docs/lineamientos-generales.md §3.13).

### Fase 3 — Mapeo contra lo existente
- Corpus: consultar los documentos ya ingestados de la categoría (tabla Document por
  categoria/subcategoria) — ¿ya hay una versión de este texto?
- Skills/rules: `grep -ri "<concepto>" backend/src/mastra/dominios/` sobre rules,
  static-skills y tool-skills.
- Lo nuevo NO es automáticamente mejor:

| Nuevo vs existente | Acción |
|---|---|
| Más preciso Y más conciso | REPLACE |
| Más preciso pero más verboso | REWRITE condensando lo mejor de ambos |
| Igual de preciso | DISCARD el nuevo |
| Contradice lo existente | INVESTIGAR — pregunta al equipo legal cuál rige |

Nunca conservar dos versiones del mismo conocimiento.

### Fase 4 — Decisiones arquitectónicas
- ¿Static o tool skill? Test: ¿el agente SIEMPRE necesita esto cuando la condición da
  true? Sí → static. A veces → tool.
- ¿Split (cubre 2+ dominios, >120 líneas por agente) o merge (alto solape)?
- **Anchor**: si una rule/directiva activa instruye "ofrecé/explicá/proponé X" y X
  queda cubierto por una tool skill nueva, esa rule debe anclar la skill
  explícitamente ("ANTES de explicar X, cargá guia-<id>") — sin anchor el agente
  improvisa con conocimiento genérico en vez de cargar la guía curada.
- ¿Habilita categoría/subcategoría nueva? → registry
  (backend/src/mastra/dominios/registry.ts o clasificacion.ts del dominio) +
  docs/dominio-consultas.md (columna Estado con fecha). Habilitar categoría nueva
  además requiere su agente (seguir docs/guia-arquitectura.md §2).

### Fase 5 — Implementación
- RAG: `cd backend && pnpm ingest <archivo> --title "<título>" --categoria <cat>
  --subcategoria <subcat>`.
- Rules/skills: patrón y registración según `.claude/rules/prompt-assembly.md`;
  calidad según la taxonomía. Orden de preferencia:
  ELIMINAR > REESCRIBIR > CONDENSAR > AGREGAR
  (la densidad sube; el tamaño total no crece).
- Contenido inyectado nuevo o modificado: auditar contradicciones contra el prompt
  ENSAMBLADO del agente (correr buildXInstructions y leerlo), no contra la rule
  aislada.

### Fase 6 — Verificación y registro
- `cd backend && pnpm test && pnpm lint && pnpm evals` — todo verde.
- Cada documento agrega o ajusta items del golden set que midan el gap que vino a
  cerrar (corpus nuevo → items de citación; conocimiento de clasificación → items de
  detección). Un documento que no mueve ninguna eval es sospechoso: ¿aportó algo?
- Registrar en docs/plans/ una entrada fechada
  (`YYYY-MM-DD-procesamiento-<documento>.md`): piezas, destinos, descartes con
  motivo, evals agregadas, y referencia al archivo de preguntas.
- **Preguntas al equipo legal en archivo enviable**: si el procesamiento dejó
  preguntas abiertas, crear `docs/preguntas-legales/YYYY-MM-DD-<documento>.md`
  redactado PARA los abogados (auto-contenido: referencia al documento fuente y
  sus páginas, cita textual del pasaje dudoso, la pregunta concreta en negrita;
  sin rutas de código ni jerga del repo), con encabezado de estado
  (`PENDIENTE de respuesta`) e instrucciones de cómo responder. Ese archivo se
  envía tal cual al equipo legal; la entrada en docs/plans/ solo lo referencia.
  Al recibir respuestas, se procesan como material nuevo (esta misma skill) y el
  archivo pasa a estado `RESPONDIDA` con fecha.
- Commit convencional; nunca push directo a main.

## Red flags
- Ingerir un documento entero al RAG "porque es más fácil" sin triage por pieza.
- Copiar texto del experto a una skill con citas normativas embebidas (van al RAG).
- Agregar contenido sin buscar qué existe (acumular sin comparar).
- Asumir la respuesta a una duda legal en vez de derivarla al equipo de expertos.
- Terminar sin evals nuevas ni registro del procesamiento.
