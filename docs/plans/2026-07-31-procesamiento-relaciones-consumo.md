# Procesamiento del material de relaciones de consumo — habilitación de la categoría (2026-07-31)

Registro del procesamiento (skill `procesar-documento-legal`) del material que el equipo
legal envió para incorporar la **categoría Relaciones de consumo**. Material fuente en
`docs/relaciones_de_consumo/`:

1. *Ley N° 17.250 — Defensa del Consumidor* (consolidado IMPO, 21 pp., 52 artículos, con
   las reformas de las Leyes 19.149/2013, 19.355/2015, 19.924/2020 y 20.212/2023).
2. *Decreto N° 244/000 — Reglamentación de la Ley de Relaciones de Consumo* (6 pp.).
3. *Ley N° 18.507 — Procedimiento judicial de defensa al consumidor* (3 pp., pequeñas
   causas ante Juzgado de Paz).
4. *Instructivo del MEF — Consulta, Reclamación o Denuncia* (12 pp., paso a paso del
   trámite en línea).
5. *Trámite administrativo + link* (1 p., requisitos, plazos de gestión y contacto).

Los cinco se leyeron completos (extracción de texto con pypdf; sin poppler para render).

## Resultado

- **Categoría `relaciones-consumo` habilitada** con su agente (`relacionesConsumoAgent`,
  id `relaciones-consumo`), calcado del patrón familia. Registry-driven: receptor, tool
  `asignar-clasificacion`, endpoint `/dominios` y BFF se extendieron sin tocar código
  existente ("escalar = agregar").
- **2 subcategorías habilitadas** (las de la taxonomía): `derechos-del-consumidor` y
  `procedimiento-mef-judicial` (ids que ya definía el placeholder del registry).
- **Corpus**: 16 documentos temáticos (30 chunks) en `backend/corpus/relaciones-consumo/`,
  ingestados a la base (READY). Distribución: transversal (NULL) 3 · derechos del
  consumidor 10 · procedimiento MEF/judicial 3. Reemplaza al fixture histórico
  `backend/corpus/uy-ley-17250-defensa-consumidor.txt` (eliminado: versión sin el art.
  16-BIS ni curaduría temática; nunca estuvo ingerido).
- **Evals**: 3 datasets nuevos (`consumo-citacion` 8 ítems, `consumo-voz-fuentes` 3,
  `consumo-captacion` 2); receptor +6 ítems de consumo y 1 ítem flipeado (la heladera
  rota esperaba `categoria-no-habilitada`, ahora `relaciones-consumo`); prefijo
  "Relaciones de consumo —" sumado al detector de fugas de fuentes internas.
  Resultados en la sección "Verificación" de abajo.

## Triage por pieza

### Ley 17.250 (texto normativo)

| Pieza | Destino |
|---|---|
| Caps. I-II (conceptos: consumidor, proveedor, relación de consumo, producto/servicio; derechos básicos; idioma e información contradictoria) | **RAG transversal** (`generales/01-02`) + prueba de la relación (Decreto art. 1) |
| Cap. XIV (caducidad por vicios 30/90 días, vicios ocultos, prescripción de daños personales, interrupción) + Ley 18.507 art. 5 | **RAG transversal** (`generales/03`) — plazos que rigen tanto el derecho como la vía |
| Caps. IV-VI (oferta, información previa, precios; oferta de productos y servicios) + Decreto arts. 2-5 y 7 | **RAG** derechos (`01-informacion-precios-oferta`) |
| Art. 16 y 16-BIS (retracto en ventas fuera del local y sus excepciones) + Decreto art. 6 | **RAG** derechos (`02-compras-distancia-derecho-retracto`) |
| Cap. VII (prácticas abusivas, art. 22) | **RAG** derechos (`03-practicas-abusivas`) |
| Cap. VIII (garantía art. 23; repuestos art. 18; usados art. 19) | **RAG** derechos (`04-garantia-repuestos-productos-usados`) |
| Cap. IX (publicidad, arts. 24-27) + art. 51 (contrapublicidad) + Decreto art. 19 | **RAG** derechos (`05-publicidad-enganosa`) |
| Caps. X-XI (adhesión y cláusulas abusivas, arts. 28-31, incl. renovación automática texto 2023) | **RAG** derechos (`06-contratos-adhesion-clausulas-abusivas`) |
| Cap. XII (incumplimiento, opciones del consumidor, arts. 32-33) | **RAG** derechos (`07-incumplimiento-opciones-consumidor`) |
| Cap. XIII (responsabilidad por daños, arts. 34-36) | **RAG** derechos (`08-responsabilidad-danos`) |
| Cap. III (salud y seguridad, arts. 7-11) | **RAG** derechos (`10-salud-seguridad`) |
| Cap. XV (organización administrativa, arts. 40-42; audiencia administrativa) | **RAG** procedimiento (`01-reclamo-defensa-consumidor-mef`) |
| Arts. 43-51 (infracciones, sanciones, procedimiento sancionatorio) | **RAG** procedimiento (`02-infracciones-sanciones`) |
| Art. 52 (declara inexistente la "Ley 17.189" de 1999) | **Descarte**: housekeeping histórico sin valor para orientar una consulta |
| Chrome IMPO (headers/URLs por página, "Referencias al artículo", notas de vigencia, "Ayuda") | **Descarte** del corpus (las reformas relevantes se citan inline: "en la redacción dada por la Ley X") |

### Decreto 244/000

| Pieza | Destino |
|---|---|
| Art. 1 (prueba de la relación de consumo: factura u otros medios) | **RAG transversal** (`generales/01`) |
| Arts. 2-5, 7 (exhibición de precios, contado con impuestos, financiación, entidad financiera, manual en español) | **RAG** derechos (`01`) |
| Art. 6 (retracto: devolución simultánea, tarjetas, locales acondicionados para ofertar) | **RAG** derechos (`02`) |
| Arts. 8-9 (presupuesto de servicios: contenido, validez 10 días, adicionales) | **RAG** derechos (`09-presupuesto-servicios`) |
| Arts. 11-14, 16 (audiencia administrativa; remisión de denuncias 72 h) | **RAG** procedimiento (`01`) |
| Art. 19 (sustento del mensaje publicitario, 90 días) | **RAG** derechos (`05`) |
| Art. 10 (Registro de Asociaciones de Consumidores), arts. 15, 17-18 (remisiones), art. 20 (transitorio del año 2000), art. 21 (comuníquese) | **Descarte**: registro institucional y normas instrumentales/agotadas, sin valor para orientar una consulta individual. El art. 18 (exhorto al BCU) alimentó la pregunta 2 al equipo legal |

### Ley 18.507

| Pieza | Destino |
|---|---|
| Arts. 1-6 (pequeñas causas ≤100 UR: competencia, procedimiento, sin abogado obligatorio, timbre 1%, caducidad anual, supletorias) | **RAG** procedimiento (`03-proceso-judicial-pequenas-causas`); la caducidad además en `generales/03` |

### Instructivo MEF + Trámite administrativo

| Pieza | Destino |
|---|---|
| URL del trámite en línea, inicio sin usuario (solo email), estructura del formulario (solicitante, proveedor, tipo de trámite, relato, adjuntos) | **RAG** procedimiento (`01`), destilado |
| Requisitos por tipo (consulta/reclamo vs. denuncia), duración estimada 45 días, teléfono 0800 7005, no-confidencialidad de la denuncia remitida, link gub.uy | **RAG** procedimiento (`01`) |
| Narración click-por-click de la interfaz del formulario (Figuras 1-17: "haga clic", autocompletados, capturas) | **Descarte**: instrucción de UI de un formulario externo sin valor normativo ni orientativo; el dato útil es que el trámite existe, dónde se hace y qué requiere |

### Piezas → skills/rules (conocimiento y conducta, sin citas embebidas)

| Pieza | Destino |
|---|---|
| Qué releva un abogado en un caso de consumo (prueba de la compra, reclamo previo al proveedor y su efecto sobre plazos, monto en juego, fechas), señales de urgencia, escalera de reclamo, errores comunes del consultante | **Static skill** `dimensionar-consumo` |
| Subcategorías y su registro acumulativo | **Static skill** `subcategorias-consumo` (generada desde el registry) |
| Anti-fabricación con las hipótesis propias del dominio (plazos por tipo de vicio/producto/reclamo previo; retracto con excepciones), montos en UR sin convertir, calificaciones que decide el juez, materias de otro organismo sin improvisar, frase institucional adaptada | **Rule** `conducta-consumo` (crítica) |
| Identidad del especialista | **Rule** `rol-especialista-consumo` |

## Decisiones arquitectónicas

1. **Ids preexistentes del registry respetados**: el placeholder deshabilitado ya definía
   `relaciones-consumo`, `derechos-del-consumidor` y `procedimiento-mef-judicial`; la
   habilitación reemplaza el objeto inline por `clasificacion.ts` del dominio (mismo
   patrón -16/+16 del commit de familia).
2. **Conceptos y plazos como corpus transversal** (`subcategoria = NULL`): la relación de
   consumo y su prueba, los derechos básicos y los plazos de caducidad/prescripción
   rigen para ambas subcategorías; el `OR IS NULL` del retrieval los mantiene siempre
   en alcance. Las dos subcategorías no son regímenes en conflicto (a diferencia de
   rural/call-center en laboral): no requieren partición defensiva en la rule.
3. **Sin protocolo de caso sensible propio**: consumo no tiene un perfil de riesgo
   personal análogo a violencia; el protocolo global del receptor queda intacto y la
   rule `caso-sensible` no versiona para este agente (test explícito de esa ausencia).
4. **Frase institucional Jurco** adaptada mecánicamente ("…en materia de defensa del
   consumidor"); confirmación pedida al equipo legal (pregunta 3).
5. **Captación vs. vías gratuitas**: la Ley 18.507 (sin abogado obligatorio ≤100 UR) y la
   vía administrativa gratuita tensionan con el funnel. Criterio provisorio: honestidad
   completa sobre las vías + ofrecer la derivación igual; criterio definitivo pedido al
   equipo legal (pregunta 1).
6. **`proceso-derivacion` (tool-skill), `captacion-caso` e `identidad-jurco` (rules)**:
   contenido compartido, se agregó la clave `relaciones-consumo`.
7. **Reemplazo del fixture histórico**: `backend/corpus/uy-ley-17250-defensa-consumidor.txt`
   (del cableo inicial del RAG, nunca ingerido, sin art. 16-BIS) eliminado — nunca dos
   versiones del mismo conocimiento.

## Archivos tocados

- Backend nuevo: `dominios/relaciones-consumo/` (clasificacion, rules
  `rol-especialista-consumo` y `conducta-consumo` [crítica], static-skills
  `subcategorias-consumo` y `dimensionar-consumo`, instructions + test, agente).
- Backend modificado: `models` (AgentId), `dominios/registry.ts`, rules
  `identidad-jurco` y `captacion-caso`, tool-skill `proceso-derivacion`, registries de
  rules/skills, `mastra/index.ts`, `run-evals.ts` + datasets, y los tests de listas
  exactas (registry, api-dominios, rules index).
- Corpus: `backend/corpus/relaciones-consumo/**` (16 archivos) ingestados a la base
  (idempotente por título; invisible al público hasta el deploy del agente);
  `uy-ley-17250-defensa-consumidor.txt` eliminado.
- Docs: `dominio-consultas.md` (Estado + nota de transversales), CLAUDE.md (línea
  "Habilitado"), este plan, `docs/preguntas-legales/2026-07-31-relaciones-de-consumo.md`,
  material fuente en `docs/relaciones_de_consumo/`.

## Verificación

- `pnpm test`: 20 archivos / 78 tests verdes. `pnpm lint`: limpio.
- `pnpm evals` (suite completa, threshold 90% por dataset):
  - **Consumo (datasets nuevos): 13/13** — citación 8/8, voz-fuentes 3/3, captación 2/2.
  - **Receptor: 31/32 (97%)** — único miss: ante "¿puedo demandar a una empresa por un
    reclamo chico sin contratar abogado?" el receptor repreguntó en vez de clasificar
    (comportamiento defendible; dentro del threshold).
  - Laboral citación 19/19, voz-fuentes 7/7, captación 3/3; familia 8/8, 4/4, 2/2 — sin
    regresión.
  - **`laboral-fidelidad`: por debajo del gate — flaky pre-existente, NO regresión de
    este cambio.** Cuatro corridas: 5/6, 5/6, 4/6 (esta rama) y **5/6 sobre un checkout
    prístino de `origin/main`** (sin nada de esta rama). Los ítems fallados rotan:
    rural con "respuesta vacía" (infra), nocturnidad "desde la primera hora" sin
    respaldo (2 veces, incluida la corrida en main) y BSE "triple" sin respaldo — los
    dos últimos son exactamente los contra-ejemplos de `conducta-laboral`, que el
    agente viola de forma intermitente. Esta habilitación no toca ninguna superficie
    del agente laboral (su prompt ensamblado queda byte-igual). **Follow-up necesario**
    (trabajo aparte, no de esta rama): la fidelidad del laboral a las condiciones del
    régimen está degradada en `main`; además, con 6 ítems y threshold 90% un solo fallo
    rompe el gate. Diagnóstico por trazas + ajuste de `conducta-laboral` según
    `eval-design.md` (loop Define → Test → Diagnose → Fix).

## Preguntas al equipo legal

En `docs/preguntas-legales/2026-07-31-relaciones-de-consumo.md` (enviable, estado
PENDIENTE): criterio ante casos auto-tramitables sin abogado (pequeñas causas / vía
administrativa); materias con regulador propio (BCU, telecomunicaciones, energía, salud);
confirmación de la frase institucional; material complementario (usura/créditos al
consumo, reglamentación de rotulado y garantías); y el criterio de montos en UR sin
conversión. Ninguna bloquea lo habilitado.
