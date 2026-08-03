# Procesamiento: respuestas de arrendamientos + Decreto-Ley 14.384 (rural) — 2026-08-03

Registro del procesamiento (skill `procesar-documento-legal`) de dos materiales del equipo
legal recibidos juntos el 2026-08-03:

1. **Respuestas a las 8 preguntas** de `docs/preguntas-legales/2026-07-31-arrendamientos.md`
   (ahora RESPONDIDA con las respuestas incorporadas al archivo).
2. **Texto consolidado del Decreto-Ley Nº 14.384** (arrendamientos rurales), impresión IMPO
   de 28 páginas, enviado en respuesta a la pregunta 8. Fuente en
   `docs/arrendamiento-desalojo/Decreto Ley N° 14384 -ARRENDAMIENTOS RURALES-.pdf`.
   Leído completo.

## Triage por pieza

| Pieza | Destino |
|---|---|
| Respuesta 1 (19980 era typo; la ley es la **19.889**) | Confirmación de lo implementado — solo docs (comentario de `clasificacion.ts`, `dominio-consultas.md`) |
| Respuesta 2 (frase institucional Jurco aprobada) | Confirmación — la rule `conducta-arrendamiento` ya la traía; sin cambios |
| Respuesta 3 (art. 51 DL 14.219 textual: clausura 40%; la reserva del documento apuntaba a regímenes con % distinto, ej. Ley 19.889 art. 445: 60%) | **RAG**: reescrito el bullet de clausura de `desalojo-ley-14219/02-mal-pagador-mora.md` (texto confirmado + contraste explícito 40% vs 60% para anti-contaminación) + eval de fidelidad |
| Respuesta 4 (ex concubino: canalizar **por el fin** — recuperar la vivienda → arrendamientos) | Confirmación del ruteo actual → ítem nuevo del golden set del receptor que fija la frontera |
| Respuesta 5 (vivienda por empleo: rural despedido → laboral; portero u otros urbanos → arrendamientos) | Confirmación — sin cambios; la descripción de la subcategoría rural nueva declara la frontera |
| Respuestas 6 y 7 (temporada dentro de 14219; no habitacionales en 8153) | Confirmación — sin cambios |
| DL 14.384: ámbito y exclusiones (arts. 2, 3, 24, 68, 69, 75), forma escrita/inscripción/nulidad y multa (arts. 4-8, 10, 49, 71) | **RAG** `arrendamiento-rural/01-regimen-y-contrato.md` |
| DL 14.384: competencia y procedimiento de desalojo (arts. 36-45), plazos (art. 41: buen cumplidor 1 año / mora 60 días / precario 30 días), clausura 60% (art. 42), reforma del plazo (art. 43), lanzamiento (arts. 51, 58), entrega de la cosa (arts. 56-57, 74) | **RAG** `arrendamiento-rural/02-desalojo-y-entrega-del-predio.md` |
| DL 14.384: mora (art. 46), intimaciones y tributos (art. 47), oblación/consignación BROU (art. 48), acumulación del cobro y embargo (art. 52) | **RAG** `arrendamiento-rural/03-mora-y-cobro-rural.md` |
| DL 14.384: revisión de precio (arts. 19, 22, 23), mejoras (arts. 26-34), aparcería (arts. 24-25), prohibición de remate (art. 65) | **RAG** `arrendamiento-rural/04-precio-mejoras-aparceria.md` |
| DL 14.384: arts. derogados por Ley 16.223 (1, 11-18 — todo el capítulo de plazos —, 61, 63-64, 66) | El corpus registra SOLO la derogación del capítulo de plazos (afecta qué puede afirmar el agente); qué rige hoy es **pregunta 1** del archivo nuevo — no se inventa |
| DL 14.384: transitorias y vigencia 1975/76 (arts. 9, 60, 72-73, 76-77), difusión registral (art. 70), préstamos de colonización (art. 62), programática de jurisdicción especial (art. 35), detalle procesal de audiencias/arbitraje/revisión (arts. 20-21, 30, 32, 38, 53-55, 59) | **Descarte**: contenido agotado en el tiempo, metodología judicial o detalle procesal que no cambia lo que el asistente puede explicar a un consultante; la existencia del arbitraje de mejoras y de la revisión judicial sí quedó (archivo 04) |
| DL 14.384: montos del art. 65 en pesos de 1975 | **Descarte de los montos** (desactualizados); la prohibición y la sanción quedan sin cifra — **pregunta 4** del archivo nuevo |

## Decisiones arquitectónicas

1. **Subcategoría nueva `arrendamiento-rural`** dentro de `arrendamiento-desalojo` (no estaba
   en la taxonomía original de 5). Mismo precedente que 19889: se habilita y se pide
   confirmación (pregunta 2 del archivo nuevo). Es la partición anti-contaminación por
   régimen llevada un paso más: el rural tiene plazos propios (1 año / 60 días / 30 días)
   y clausura del 60% — coincidente en el número con la 19.889 pero de régimen distinto.
2. **Static, no tool**: el corpus rural entra por `buscar-documentos` con el filtro de
   subcategoría existente; no hace falta tool-skill nueva ni anchor.
3. **Prompt del agente**: `rol-especialista-arrendamiento` pasa de "arrendamientos urbanos"
   a "urbanos y rurales"; `conducta-arrendamiento` suma el DL 14.384 a la lista de
   regímenes del encuadre y pierde el ejemplo "arrendamientos rurales" de la regla de
   honestidad (ya hay material); `subcategorias-arrendamiento` aclara que las tres
   subcategorías por régimen son de desalojo **urbano** y que el destino agropecuario es
   `arrendamiento-rural`; `dimensionar-arrendamiento` agrega el destino rural al encuadre.
   Contradicciones auditadas sobre el prompt ENSAMBLADO (dos detectadas y corregidas:
   el rol decía "urbanos" y el destino de la skill no contemplaba explotación rural).
4. **Receptor sin cambios de código**: `universo-categorias` es registry-driven; la señal
   nueva ("arrienda un campo, chacra o predio rural...") y la descripción de la
   subcategoría le llegan desde `clasificacion.ts`.
5. **Corpus del mapa transversal**: `generales/01-mapa-regimenes.md` suma el supuesto rural
   al mapa (deriva el encuadre al DL 14.384 y avisa que ningún plazo urbano aplica al
   predio rural). `desalojo-ley-14219/02-mal-pagador-mora.md` reemplaza la reserva de la
   clausura por el texto confirmado del art. 51.
6. **Frontend/board: cero cambios** (registry-driven, igual que la habilitación original).

## Archivos tocados

- Corpus nuevo: `backend/corpus/arrendamiento-desalojo/arrendamiento-rural/01..04` (4
  archivos), ingestados a la base con `--subcategoria arrendamiento-rural` (READY).
- Corpus modificado y re-ingestado: `generales/01-mapa-regimenes.md`,
  `desalojo-ley-14219/02-mal-pagador-mora.md`.
- Backend: `dominios/arrendamiento-desalojo/clasificacion.ts` (+subcategoría, descripción
  y señal rural, nota 19889 confirmada), rules `rol-especialista-arrendamiento` y
  `conducta-arrendamiento`, static-skills `subcategorias-arrendamiento` y
  `dimensionar-arrendamiento`, tests de enumeración (`registry.test.ts`,
  `api-dominios.test.ts`).
- Evals: golden del receptor +2 (campo ganadero → `arrendamiento-rural`; ex concubino →
  `arrendamiento-desalojo` por el fin), arrendamiento `citacion` +1 (arrendar un campo),
  `fidelidad` +4 (clausura urbana 40% — cierra la respuesta 3; clausura rural 60%; buen
  cumplidor rural 1 año; contrato rural de palabra → nulidad/escrito). Sin `prohibido`
  nuevos: detección positiva, según la lección del 2026-07-31.
- Docs: `dominio-consultas.md` (fila rural + confirmaciones), `CLAUDE.md` (línea
  Habilitado: 6 subcategorías), `docs/preguntas-legales/2026-07-31-arrendamientos.md`
  (RESPONDIDA), `docs/preguntas-legales/2026-08-03-arrendamientos-rurales.md` (nuevo,
  PENDIENTE: plazos post-Ley 16.223, encuadre de la subcategoría, contratos excluidos,
  montos del art. 65), este plan.

## Evals (resultado)

Corrida sobre los datasets afectados por el cambio (los demás agentes no cambiaron de
prompt ni de corpus), threshold 0.9:

- **Receptor: 49/51 (96%)** — los 2 ítems nuevos (campo ganadero → `arrendamiento-rural`;
  ex concubino → `arrendamiento-desalojo`) pasaron. Los 2 fallos son ítems preexistentes
  ajenos a este cambio: "tengo un problema y no se que hacer" (esperaba `pregunta:true`,
  clasificó `fuera-de-universo` con confianza alta) y el de pensión tras divorcio del
  procesamiento del Código Civil (esperaba `divorcio-sociedad-conyugal`, dio
  `pension-tenencia-visitas` — frontera fina entre subcategorías de familia). Quedan
  anotados como ruido/borderline conocido para la sesión que sea dueña de esos datasets.
- **Arrendamiento: citación 9/9 · voz-fuentes 3/3 · captación 2/2 · fidelidad 10/10**
  (incluye los 4 ítems nuevos: clausura urbana 40%, clausura rural 60%, buen cumplidor
  rural 1 año, contrato rural de palabra).
