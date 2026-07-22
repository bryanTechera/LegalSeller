# Procesamiento del material de familia — habilitación de la categoría (2026-07-22)

Registro del procesamiento (skill `procesar-documento-legal`) del material que el equipo
legal envió para incorporar la **categoría Familia**. Material fuente en `docs/familia/`:

1. *Derecho de familia — Síntesis jurídica, actualizada y didáctica para consulta
   asistida por IA* (18 pp., actualizada al 19/07/2026) — el documento del experto,
   escrito específicamente para este sistema.
2. *Código Civil* (texto consolidado IMPO, 585 pp., incluye Leyes 20.443 y 20.446).
3. *Código de la Niñez y la Adolescencia* (consolidado IMPO, 127 pp., incluye Leyes
   20.141, 20.212, 19.747, 19.727, 19.092, 20.266).
4. *Ley 19.580 — Violencia hacia las mujeres basada en género* (consolidada, 52 pp.).
5. *Ley 19.684 — Ley integral para personas trans* (consolidada, 10 pp.).
6. *Decreto 104/019 — Reglamentación de la Ley 19.684* (15 pp.).

Los seis se leyeron completos (el Código Civil: estructura completa, verificación de
consolidación con las reformas dic-2025/2026, y lectura íntegra de los títulos de
familia; los libros de bienes/obligaciones/contratos son ajenos a la categoría).

## Resultado

- **Categoría `familia` habilitada** con su agente (`familiaAgent`, id `familia`),
  calcado del patrón laboral. Registry-driven: receptor, tool `asignar-clasificacion`,
  endpoint `/dominios` y BFF se extendieron sin tocar código existente ("escalar =
  agregar").
- **5 subcategorías habilitadas** (las de la taxonomía): pension-tenencia-visitas,
  divorcio-sociedad-conyugal, sucesiones, union-concubinaria, violencia-de-genero.
- **Corpus**: 24 documentos temáticos (56 chunks) en `backend/corpus/familia/`,
  ingestados a la base (READY). Distribución: transversal (NULL) 10 · pensión/tenencia/
  visitas 4 · divorcio/sociedad conyugal 4 · violencia 4 · unión concubinaria 1 ·
  sucesiones 1.
- **Evals** (todas 100%, threshold 90%): receptor 24/24 (7 ítems familia nuevos, 2
  ítems que antes esperaban `categoria-no-habilitada` ahora esperan la clasificación
  real); familia citación 8/8 y voz-fuentes 3/3 (datasets nuevos); laboral sin
  regresión (14/14 y 6/6). Runner generalizado por agente de categoría.

## Triage por pieza

### Síntesis didáctica (documento del experto)

| Pieza | Destino |
|---|---|
| Secciones normativas 1 y 4-15 (mapa procesal, matrimonio/divorcio, medidas sobre hijos, corresponsabilidad/tenencia, visitas, alimentos, violencia, filiación/nombre/partidas, identidad de género, concubinato, adopción, sucesión/capacidad, sociedad conyugal) | **RAG** — base de los 24 archivos temáticos, reforzados con el texto literal de los artículos que la propia síntesis cita, transcripto de los consolidados enviados |
| "Cómo debe usar esta base una IA" (p. 2) + tablas "Respuesta de la IA" + recuadros "Para la IA" | **Rule** `conducta-familia` (separar regla general/excepciones/provisorias; nunca presentar como automático lo que el juez "podrá"; no recomendar incumplir regímenes; no mediación ante violencia; adopción sin atajos) y **skill** `dimensionar-familia` (relevamiento) |
| Checklists de actuación §16.1-16.3 + señales de urgencia §16.4 | **Skill** `dimensionar-familia` |
| Advertencia de derivación urgente + no-confrontación (§3, §9) | **Rule** `caso-sensible` extendida al agente familia (tratamiento diferencial de violencia, ver dominio-consultas §4) |
| Glosario (§17) | **Descarte**: definiciones que el modelo conoce; los matices uruguayos ya están integrados en las secciones temáticas que van al RAG (evita dos versiones del mismo conocimiento) |
| Modelos de respuesta (§18) | **Descarte como texto literal**: voz "usted" (el proyecto es voseante) y guion para el consultante (audiencia equivocada para una skill). Su contenido único ("qué conviene hacer": documentos a reunir, conducta prudente) quedó integrado en los archivos RAG temáticos correspondientes |
| Normativa y control de vigencia (§19) | **Descarte** para corpus (metadata); sirvió para detectar faltantes → preguntas |

### Textos normativos

| Pieza | Destino |
|---|---|
| CC: títulos de familia del Libro Primero (matrimonio arts. 81-212 con las reformas 20.443/20.446, filiación, adopción, patria potestad, tutela, curatela), sociedad conyugal (art. 1985 y conc.), sucesiones | **RAG selectivo**: artículos citados por el experto transcriptos dentro de los archivos temáticos. **NO se ingirió el código completo**: el patrón de corpus es curado temático; 585 pp. con ruido IMPO (headers, URLs, notas de redacción) degradan el retrieval, y los libros de bienes/obligaciones/contratos son ajenos a la categoría |
| CNA: filiación/nombre (23-33), tenencia (34-37), visitas (38-44 y 35-BIS), alimentos (45-64), protección y maltrato (117-131), adopción (132-160), viajes (191-194), investigación de paternidad (197-205) | **RAG selectivo** en los archivos temáticos (los artículos reformados 2023-2026 casi íntegros) |
| CNA: infracciones adolescentes a la ley penal (69-116 BIS), trabajo adolescente (161-180), prevención especial/publicidad (181-190), registros y consejos (211-224) | **Descarte** para familia: derecho penal juvenil / laboral adolescente / administrativo, fuera de las subcategorías de la categoría |
| Ley 19.580: definiciones y derechos (1-9), proceso de protección y medidas (45-70), procesos de familia (71-74), penal-víctima (75-81), derechos sociales (36-43), difusión de imágenes (92-93) | **RAG** (4 archivos de violencia) |
| Ley 19.580: institucionalidad y directrices a organismos estatales (10-35) | **Descarte**: obligaciones del Estado, sin valor para orientar una consulta individual |
| Ley 19.580 art. 40 (estabilidad laboral de la víctima) | Ya cubierto en el corpus **despido** (`14-despido-violencia-genero.md`) — en familia solo se menciona con remisión conceptual; no se duplica el tratamiento |
| Ley 19.684 + Decreto 104/019: adecuación registral (arts. 1-9 + cap. I), menores (art. 6 + decreto art. 2), reparatoria/cupos/salud | **RAG** (2 archivos transversales: adecuación registral; derechos de las personas trans) |

### Decisiones arquitectónicas

1. **Temas sin subcategoría en la taxonomía** (adopción, filiación/partidas, identidad
   de género, capacidad/curatela, viajes de menores): corpus **transversal a nivel
   categoría** (`subcategoria = NULL`, siempre en alcance del retrieval por el
   `OR IS NULL`). No se inventaron subcategorías nuevas — la taxonomía la define el
   equipo; queda preguntado si las quieren como subcategorías del caso.
2. **Violencia de género habilitada CON tratamiento diferencial** (prerequisito de
   dominio-consultas §4): protocolo implementado en rules (detalle en ese doc §4).
   Validación del protocolo y canales definitivos pedidos al equipo legal.
3. **Frase institucional Jurco** adaptada mecánicamente para el agente familia
   ("…en materia de familia"); confirmación pedida al equipo legal.
4. **Sucesiones habilitada con corpus mínimo** (mapa del proceso, desde la síntesis
   §14.1): alcanza para orientar el concepto y captar el caso; el agente es honesto
   cuando el detalle excede el material (rule `conducta-familia`). No se curaron
   artículos de sucesiones del CC por cuenta propia — la síntesis no los señala y esa
   selección es del experto. Material profundo pedido.
5. `proceso-derivacion` (tool-skill) y `captacion-caso` (rule): contenido compartido
   entre laboral y familia (mismo texto, dos claves).

## Archivos tocados

- Backend nuevo: `dominios/familia/` (clasificacion, rules `rol-especialista-familia` y
  `conducta-familia` [crítica], static-skills `subcategorias-familia` y
  `dimensionar-familia`, instructions, agente) + tests.
- Backend modificado: `models` (AgentId), `dominios/registry.ts`, rules `caso-sensible`
  (versión especialista para familia), `identidad-jurco`, `captacion-caso`,
  tool-skill `proceso-derivacion`, registries de rules/skills, `mastra/index.ts`,
  `run-evals.ts` + datasets.
- Corpus: `backend/corpus/familia/**` (24 archivos), ingestados a la base de Railway
  (operación idempotente por título; invisible al público hasta el deploy del agente).
- Docs: `dominio-consultas.md` (Estado + §4), este plan,
  `docs/preguntas-legales/2026-07-22-familia.md`, CLAUDE.md (línea "Habilitado"),
  material fuente movido de `docs/laboral/familia/` a `docs/familia/`.

## Preguntas al equipo legal

En `docs/preguntas-legales/2026-07-22-familia.md` (enviable, estado PENDIENTE):
confirmación de la frase institucional para familia; material faltante (CGP, Ley
18.246, Ley 17.514, sucesiones y tutela/curatela en profundidad); validación del
protocolo de violencia y canales; y si adopción/identidad de género/filiación deben
ser subcategorías del caso. Ninguna bloquea lo habilitado.
