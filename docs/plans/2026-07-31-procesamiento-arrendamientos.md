# Procesamiento del material de arrendamientos — habilitación de la categoría (2026-07-31)

Registro del procesamiento (skill `procesar-documento-legal`) del material que el equipo
legal envió para incorporar la **categoría Arrendamiento y desalojo**. Material fuente en
`docs/arrendamiento-desalojo/`:

1. *Arrendamientos urbanos y desalojo* (37 pp., síntesis jurídica y didáctica actualizada
   al 19/07/2026) — documento del experto, escrito específicamente para consulta asistida
   por IA (mismo autor/formato que la síntesis de familia). Base: texto consolidado IMPO;
   comprende Ley 19.889 (arts. 421-459), Ley 19.924 (procesal), Ley 20.352 (temporada) y
   las modificaciones vigentes desde el 1/1/2026 de la Ley 20.446.

Leído completo (las 37 páginas).

## Resultado

- **Categoría `arrendamiento-desalojo` habilitada** con su agente
  (`arrendamientoDesalojoAgent`, id `arrendamiento-desalojo`), calcado del patrón
  familia. Registry-driven: receptor, tool `asignar-clasificacion`, endpoint `/dominios`
  y BFF se extendieron sin tocar código existente ("escalar = agregar"). Frontend: cero
  cambios.
- **5 subcategorías habilitadas** (las de la taxonomía): contrato-de-alquiler,
  desalojo-ley-8153, desalojo-ley-14219, desalojo-ley-19889, cobro-alquileres.
  **Corrección**: la taxonomía decía "Desalojo ley 19980"; el material del experto es
  inequívoco en que el régimen sin garantía es la **Ley 19.889** — se habilitó como
  `desalojo-ley-19889` y se pidió confirmación (pregunta 1).
- **Corpus**: 20 documentos temáticos (37 chunks) en
  `backend/corpus/arrendamiento-desalojo/`, ingestados a la base (READY). Distribución:
  transversal (NULL) 5 · contrato-de-alquiler 6 · desalojo-ley-8153 1 ·
  desalojo-ley-14219 3 · desalojo-ley-19889 4 · cobro-alquileres 1.
- **Partición anti-contaminación por régimen** (análogo a rural/call-center en laboral,
  pero al nivel de la conducta): la rule `conducta-arrendamiento` exige encuadrar el
  régimen (destino, garantía, sometimiento a la 19.889) antes de afirmar un plazo, y las
  evals de fidelidad castigan el plazo de un régimen afirmado a quien está en otro.
- **Evals**: ver corrida en la sección Verificación.

## Triage por pieza

| Pieza | Destino |
|---|---|
| §1 mapa del sistema + regla operativa de encuadre + §11 cuadro comparativo + normas contemporáneas (19.889, 20.352, 20.446, CC 1782) + §12 aspectos caso a caso | **RAG transversal** (`generales/01-mapa-regimenes.md`) |
| §2 conceptos: tenencia/posesión/propiedad, arrendamiento/comodato/precario, urbano/rural | **RAG transversal** (`generales/02`) |
| §6 sistema general de desalojos (estructura monitoria, etapas, competencia, legitimación activa/pasiva, providencia, excepciones, prueba y medidas preparatorias) + suspensión del plazo al oponer excepciones (p. 34) + distinción defensa/desocupar/lanzamiento (p. 19) | **RAG transversal** (`generales/03`) |
| §8 lanzamiento y prórrogas (general 120 días DL 15.301/Ley 17.495; especiales 19.889) | **RAG transversal** (`generales/04`; las prórrogas 7/5 también en los archivos 19.889 por pertenencia al régimen) |
| §9.3 controles tributarios IRPF/IEP + excepción 19.889 | **RAG transversal** (`generales/05`) |
| §4 formación del contrato: elementos, plazo/renovación, precio/moneda/reajuste, garantías (incl. Ley 20.446 y prohibición 19.889 con multa), reparaciones/gastos, subarriendo/cesión/inspección/registro/venta | **RAG** `contrato-de-alquiler` (6 archivos) |
| §3.2-3.3 libre contratación (Ley 8.153: 6 meses/1 año; Ley 20.446 destinos no habitacionales desde 2026) | **RAG** `desalojo-ley-8153` |
| §3.1 estatuto DL 14.219 (plazo mínimo, prórroga, buen pagador 1 año, causales privilegiadas) + §7.1 mora art. 55 y mal pagador (20 días, clausura 40% con la reserva del documento, reforma +20%) + §7 causales (temporada 15, escandaloso 15, precario/comodato 15, vivienda-empleo 30, ex concubino 30, abandono 60, ruinosa 180) | **RAG** `desalojo-ley-14219` (3 archivos) |
| §5 régimen sin garantía completo (art. 421, renovación, buen pagador 30 días/excepciones 6, mal pagador 6/mora/clausura +60%, mutación, causales durante vigencia, inspecciones, rescisión vs desalojo, competencia/legitimación/exención) | **RAG** `desalojo-ley-19889` (4 archivos) |
| §9.1-9.2 separación desalojo/cobro + proceso ejecutivo + acumulación | **RAG** `cobro-alquileres` |
| Meta-instrucciones para la IA (pp. 2, 6, 19, 22, 27): clasificar el régimen antes de calcular plazos; distinguir defensa/desocupar/lanzamiento; urgencia ante notificación judicial; nunca prometer fechas; nunca aconsejar esperar ni dejar de pagar; nunca desalojo por mano propia | **Rule** `conducta-arrendamiento` (crítica) |
| Preguntas mínimas de encuadre (p. 6) + documentación a pedir (pp. 10, 27) + checklists §10 (preventivo, pre-demanda, defensa) + criterios de derivación §14.9 | **Skill** `dimensionar-arrendamiento` |
| §13 glosario en lenguaje claro | **Descarte**: definiciones que el modelo conoce; los matices uruguayos (clausura, precario, buen/mal pagador, excepciones) quedaron integrados en los archivos temáticos (precedente familia — evita dos versiones del mismo conocimiento) |
| §14 modelos de respuesta | **Descarte como texto literal**: guion para el consultante y estilo prescriptivo de respuesta (audiencia equivocada para una skill). Su contenido jurídico único (p. ej. la suspensión al oponer excepciones, la advertencia "el plazo de defensa vence antes") quedó integrado en los archivos RAG y en la rule de conducta |
| §12 listado de normativa consultada | **Descarte** para corpus (metadata); sirvió para fijar el alcance y detectar faltantes (arrendamientos rurales) → preguntas |

## Decisiones arquitectónicas

1. **Las 5 subcategorías de la taxonomía, sin inventar nuevas** (temporada queda dentro
   de `desalojo-ley-14219` por ser el art. 28 A del decreto-ley; los destinos no
   habitacionales de la Ley 20.446 quedan en `desalojo-ley-8153` porque esa ley fija sus
   plazos de desalojo por vencimiento). Ambos encuadres preguntados (preguntas 6 y 7).
2. **Conocimiento de encuadre como corpus transversal** (`subcategoria = NULL`): el mapa
   de regímenes, el proceso general, el lanzamiento y los controles tributarios rigen
   para cualquier subcategoría y quedan siempre en alcance por el `OR IS NULL` del
   retrieval.
3. **`caso-sensible` NO se extiende al agente** — el material no define protocolo
   diferencial. La urgencia procesal (notificación judicial, cedulón, lanzamiento) se
   trata como conducta (derivación inmediata, nunca esperar) y la vulnerabilidad
   (menores, embarazo, violencia) como señal de derivación urgente en
   `dimensionar-arrendamiento`, tal como las lista el §14.9 del documento.
4. **Fronteras entre categorías**: ex concubino (art. 36-BIS) y vivienda vinculada al
   empleo (art. 35) viven en el corpus de arrendamientos; el desalojo del trabajador
   rural despedido sigue en laboral (Decreto 216/012, corpus trabajador-rural). Ambas
   fronteras preguntadas (preguntas 4 y 5).
5. `proceso-derivacion` (tool-skill), `identidad-jurco` y `captacion-caso` (rules):
   contenido compartido — se agregó la clave `arrendamiento-desalojo` (mismo texto).
6. **Frase institucional Jurco** adaptada mecánicamente ("…en materia de arrendamientos
   y desalojos"); confirmación pedida (pregunta 2), igual que se hizo con familia.

## Archivos tocados

- Backend nuevo: `dominios/arrendamiento-desalojo/` (clasificacion, rules
  `rol-especialista-arrendamiento` y `conducta-arrendamiento` [crítica], static-skills
  `subcategorias-arrendamiento` y `dimensionar-arrendamiento`, instructions, agente) +
  tests.
- Backend modificado: `models` (AgentId), `dominios/registry.ts` (bloque inline →
  import), rules `identidad-jurco` y `captacion-caso` (+ clave), tool-skill
  `proceso-derivacion` (+ clave), registries de rules/skills, `mastra/index.ts`,
  `run-evals.ts` (+ agente, 4 datasets, prefijo "Arrendamiento" en
  REFERENCIAS_INTERNAS) + datasets, y tests de enumeración (registry, rules, skills,
  api-dominios, recepcion/instructions, asignar-clasificacion — esta última ahora usa
  `relaciones-consumo` como categoría deshabilitada de ejemplo).
- Corpus: `backend/corpus/arrendamiento-desalojo/**` (20 archivos md curados),
  ingestados a la base de Railway (idempotente por título; invisible al público hasta el
  deploy del agente). Títulos con prefijo "Arrendamiento — ".
- Docs: `dominio-consultas.md` (Estado + corrección 19980→19889), CLAUDE.md (línea
  "Habilitado"), este plan, `docs/preguntas-legales/2026-07-31-arrendamientos.md`,
  material fuente renombrado de `docs/arrendamiento_y_desalojo/` a
  `docs/arrendamiento-desalojo/`.

## Evals

- Receptor: golden set 26 → 31 ítems — el ítem "me quieren desalojar del apartamento
  que alquilo" pasó de `categoria-no-habilitada` a la clasificación real, y se sumaron
  5 ítems nuevos (contrato, cobro, comodato prestado, aumento en dólares, inquilino
  moroso).
- Agente arrendamiento (datasets nuevos): `citacion` (8 — toda consulta sustantiva pasa
  por buscar-documentos), `voz-fuentes` (3 — sin mecánica interna; frase Jurco),
  `captacion` (2 — pedido de contacto ignorado no se repite), `fidelidad` (6 — núcleo
  anti-contaminación entre regímenes: con garantía no rigen los 6 días hábiles sin
  intimación; sin garantía no rige la prórroga de 120 días; temporada 15 días; telegrama
  no sustituye la intimación judicial del régimen general; la sentencia con 1 año no
  posterga la defensa; mal pagador 19.889 en días hábiles).
- **Ajuste de eval-design durante la corrida** (documentado porque es un patrón a
  evitar al escribir ítems de fidelidad): dos ítems fallaron por **falso positivo del
  `prohibido`** — el string vedado aparecía en la mención *contrastiva correcta*, no
  solo en la fabricación. (a) Ítem nuevo de prórroga 19.889: la respuesta fiel dice
  "no existe la prórroga de 120 días… el máximo es 7 días hábiles" y el
  `prohibido: "hasta 120 días"` la castigaba igual; se eliminó el prohibido — el
  chequeo positivo (`contieneAlguno: 7 días`) ya detecta la fabricación por sí solo.
  (b) Ítem laboral de nocturnidad (2026-07-23): la respuesta fiel menciona "desde la
  primera hora" como ejemplo hipotético de lo que un convenio podría mejorar (con la
  aclaración de que el material no detalla el laudo); se quitó ese string del
  `prohibido` y se conservaron "grupo 19"/"subgrupo", que solo aparecen al inventar
  contenido de laudo. Ambos diagnósticos sobre la traza reproducida, no sobre el score.
  **Lección**: en ítems de fidelidad, `prohibido` solo con strings que no puedan
  aparecer en un contraste legítimo ("ese plazo es de otro régimen"); la detección
  positiva (el dato correcto exigido) es el matcher robusto.
- Resultado final (threshold 0.9, todo 100%): receptor 33/33 (corrido sobre el árbol
  que además habilita licencias-especiales en laboral, procesada en paralelo — ver
  `2026-07-31-procesamiento-licencias-especiales.md`); laboral citación 21/21,
  voz-fuentes 7/7, captación 3/3, fidelidad 9/9; familia citación 8/8, voz-fuentes
  4/4, captación 2/2; arrendamiento citación 8/8, voz-fuentes 3/3, captación 2/2,
  fidelidad 6/6.

## Preguntas al equipo legal

En `docs/preguntas-legales/2026-07-31-arrendamientos.md` (enviable, estado PENDIENTE):
confirmación del typo 19980→19.889; frase institucional; alcance actual de la clausura
del art. 51 (+40%); fronteras ex concubino (familia) y vivienda de empleo (laboral);
encuadre de temporada y de los destinos no habitacionales; material futuro de
arrendamientos rurales. Ninguna bloquea lo habilitado.
