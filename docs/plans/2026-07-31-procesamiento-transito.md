# Procesamiento del material de tránsito — habilitación de la categoría (2026-07-31)

Registro del procesamiento (skill `procesar-documento-legal`) del material que el equipo
legal envió para incorporar la **categoría Tránsito**. Material fuente en `docs/transito/`
(9 PDF, todos leídos completos):

1. *Ley 18.191 — Ley de tránsito y seguridad vial* (consolidada IMPO, 27 pp., incluye
   las redacciones dadas por las Leyes 19.360, 19.824, 19.996 y 20.212).
2. *Ley 19.824 — Actualización de la normativa de tránsito y seguridad vial*
   (consolidada, 16 pp., incluye 19.996, 20.212 y 20.446).
3. *Ley 18.412 — Seguro obligatorio de automotores (SOA)*, **documento actualizado**
   (14 pp., incluye las redacciones de las Leyes 19.678, 19.924 y 19.996).
4. *Ley 18.412 — texto original 2008* (9 pp.).
5. *Decreto 381/009 — reglamentario de la Ley 18.412* (11 pp., consolidado con 361/010).
6. *Decreto 361/010 — reglamentario de la Ley 18.412 y modificatorio del 381/009* (6 pp.).
7. *Decreto 285/016 — reglamentación de espirometría y análisis de alcohol en sangre* (4 pp.).
8. *Ley 19.678 — marco legal del mercado de seguros* (42 pp.).
9. *Reglamento Nacional de Circulación Vial* (Decreto 118/984 y modificativos, 62 pp.).

## Resultado

- **Categoría `transito` habilitada** con su agente (`transitoAgent`, id `transito`),
  calcado del patrón familia/laboral. Registry-driven: receptor, tool
  `asignar-clasificacion`, endpoint `/dominios` y BFF se extendieron sin tocar código
  existente ("escalar = agregar"). **La taxonomía pasa de 4 a 5 categorías** —
  Tránsito no estaba en el universo original de `dominio-consultas.md`; se registró
  la ampliación con fecha.
- **Sin subcategorías en v1**: la taxonomía la define el equipo (precedente familia:
  no inventar subcategorías). El corpus va entero a **nivel categoría**
  (`Document.subcategoria = NULL`, siempre en alcance del retrieval). La partición
  propuesta (siniestros/SOA · infracciones y licencia · seguros del vehículo) quedó
  como pregunta al equipo legal.
- **Corpus**: 9 documentos temáticos (29 chunks) en `backend/corpus/transito/generales/`,
  ingestados a la base (READY, títulos "Tránsito — …").
- **Rules nuevas**: `rol-especialista-transito`, `conducta-transito` (crítica).
  **Skill nueva**: `dimensionar-transito`. **Extendidas con la clave `transito`**:
  `identidad-jurco`, `captacion-caso` (ambas variantes), tool-skill `proceso-derivacion`.
- **Evals**: datasets nuevos `transito-citacion` (8), `transito-voz-fuentes` (4),
  `transito-captacion` (2); receptor +4 ítems de clasificación tránsito. Regex
  `REFERENCIAS_INTERNAS` del runner ampliada con el prefijo de títulos `Tránsito —`.

## Triage por pieza

### Ley 18.191 (consolidada)

| Pieza | Destino |
|---|---|
| Definiciones de incidente vial y siniestro (42), obligaciones del conductor implicado (43), remisión al seguro obligatorio (44) | **RAG** `01-siniestro-obligaciones-vias` |
| Alcohol: tolerancia 0,0 (45), controles y sanciones de licencia, negativa con presunción de culpabilidad (46), exámenes obligatorios con víctimas (48), extracción por técnico (49), recaudo (50), contraprueba (51), nulidad por inobservancia | **RAG** `06-alcohol-espirometria-controles` |
| Licencias (26-27), vehículos y equipamiento (28-29), luces cortas (30), cinturón (31), casco (33), reglas de circulación (14-23), señalización y semáforos (34-41), retiro de vehículos inseguros (56) | **RAG** `08-licencia-vehiculo-reglas-circulacion` (condensado; el detalle de señalización institucional se omitió por irrelevante para consultas) |
| Infracciones y sanciones (53-55) | **RAG** `07-infracciones-multas-sanciones` |
| Principios rectores (5-8), competencias departamentales (10-13), agentes de tránsito (37-40) | **Descarte parcial**: solo se conservó el art. 5.3 (retención de licencia solo por autoridad con resolución fundada); el resto es organización administrativa sin valor para una consulta individual |

### Ley 19.824

| Pieza | Destino |
|---|---|
| Infracciones leves/graves/gravísimas (21), graduación y multa al titular (22), permiso por puntos (23-24), sanciones (25), tope 10 UR rutas nacionales (26-BIS), no condicionar tributos (26-TER), no residentes (27), reincidencia (28), 2 gravísimas en 5 años (29), conducir suspendido (30), notificación (31), cambio de domicilio (32), prescripción de sanciones (33-36) | **RAG** `07-infracciones-multas-sanciones` |
| Usuarios vulnerables: peatones con celular (7), ciclistas/motociclistas (8-19) | **RAG** `08-licencia-vehiculo-reglas-circulacion` |
| Habilitación técnica (39), retiro de placas por deuda tributaria ≥5 años (40), definición PUNC (49) | **RAG** `07` y `08` |
| Elementos de seguridad de vehículos 0km (2-6) | **Descarte**: obligación del importador/fabricante, no del consultante; sin valor para orientar una consulta individual |
| Modificaciones a la 18.191 (42-48) | Ya integradas en el texto consolidado de la 18.191 — no se duplica |
| Ambulancias exceptuadas de multas de velocidad (26-BIS-A), nacionalización DUA (53) | **Descarte**: nichos sin señal de consulta |

### Ley 18.412 (SOA)

| Pieza | Destino |
|---|---|
| Texto actualizado completo: creación y definición de accidente (1-2), excluidos (3-4), efectos (5), no-terceros (6), titular (7), límites (8-9), libertad de contratación (11), reclamo y plazo de respuesta (12), acción directa (13), prescripción (14), inoponibilidad (15), repetición (16-18), coberturas especiales (19-22), mayor cuantía (23), derecho común (24), sanciones y secuestro (25-26), contralor (27-28), vehículos oficiales/BSE (29) | **RAG** `02`, `03`, `04`, `05` |
| **Texto original 2008** (PDF aparte) | **DESCARTE — duplicado desactualizado**: los arts. 21, 22 y 25 fueron sustituidos por las Leyes 19.678/19.924/19.996; conservar dos versiones del mismo texto viola "nunca conservar dos versiones del mismo conocimiento" y arriesga retrieval de redacciones derogadas |

### Decretos 381/009 y 361/010

| Pieza | Destino |
|---|---|
| Definiciones (1-4), tercero (2), baremo (7; 361/010 arts. 6-7), certificado y distintivo (9), documentación del reclamo y cómputo del plazo (10; 361/010 art. 5), repetición ampliada — alcohol, sin licencia, omisión de asistencia (11), coberturas especiales y reclamo ante SSF/BCU (12-14; 361/010 art. 4), secuestro/depositario/60 días (15-17; 361/010 arts. 10-11), multa promedio (18, 20), Carta Verde (24), fecha de referencia de cobertura (361/010 art. 3) | **RAG** `02`-`05` |
| Financiamiento del Fondo (361/010 arts. 1-2), estadística SSF (22-23), denuncia interinstitucional (19) | **Descarte**: mecánica administrativa interna del Estado |
| Disposición transitoria motos <70cc (25) | **Descarte**: beneficio vencido (3 años improrrogables desde 2009); incluirlo arriesga que el agente lo presente como vigente |
| Anexos I/II (baremos de valoración de lesiones) | **No venían en los PDF** (anexos por imagen) — pedidos al equipo legal |

### Ley 19.678 (contrato de seguro)

| Pieza | Destino |
|---|---|
| Cap. I (contrato, riesgo, póliza, obligaciones, denuncia del siniestro 5 días + inmediata en automotores, aceptación/rechazo 30 días con silencio positivo, pago 60 días + mora, franquicias, subrogación, reticencia, premio impago, pérdida de derechos, prescripción 2 años no abreviable), Cap. II Secc. I (daños patrimoniales, carga de la prueba de exclusiones, no transar sin el asegurador, valor de mercado del vehículo 72.E) y Secc. III (RC, no acción directa salvo ley → remite al SOA), Secc. IV (hurto, 80) | **RAG** `09-seguro-vehiculo-contrato` |
| Secc. II incendio, Secc. V transporte de mercaderías, Secc. VI riesgo agrícola, Cap. III seguros para las personas/vida, Cap. IV reaseguros, Cap. V DIPr, Cap. VI denominación de empresas, Cap. VII reservas previsionales, Cap. IX accidentes del trabajo, Cap. X bases de datos y registro de pólizas de vida | **Descarte para la categoría tránsito**: ajenos al dominio (accidentes del trabajo es materia laboral; vida/agrícola/incendio no son tránsito). Si algún día se habilita una categoría de seguros/consumo que los necesite, el material fuente queda en `docs/transito/` |

### Reglamento Nacional de Circulación Vial (Decreto 118/984)

| Pieza | Destino |
|---|---|
| Obligaciones ante accidente (26.1), sanciones — grados 0,5-10 UR, reincidencia, inhabilitación preventiva 72 hs, examen psicofísico tras proceso por lesiones/homicidio culposo, ebriedad 1 año/definitiva, notificación 60 días, no pago → retiro de habilitaciones (cap. XXVII) | **RAG** `01` y `07` |
| Reglas de circulación, adelantamientos, preferencias, giros, estacionamiento, cruces férreos, dos ruedas (caps. XII-XXI) | **RAG** `08` condensado (la Ley 18.191, posterior y de rango legal, prima; el reglamento aporta el detalle) |
| Categorías de licencias de 1984 (cap. III: licencias 1/2/3/4 con grados) | **Descarte**: régimen aparentemente sustituido por el PUNC (Ley 19.824); incluirlo arriesga fabricación de categorías obsoletas — confirmación pedida al equipo legal |
| Detalle técnico de luces/frenos/dimensiones (caps. VI-X), animales y tropas (XXIII), señalización institucional (XXIV, XXVIII), transporte de cargas comercial (XXII), velocidades numéricas (cap. XIII) | **Descarte** del detalle: sin señal de consulta individual; las velocidades numéricas del texto base (90/45) tienen modificativas no enviadas (Decreto 173/013) — en el corpus solo quedó la regla general de velocidad compatible + remisión a la señalización, y la confirmación de límites vigentes quedó preguntada |

### Decreto 285/016

| Pieza | Destino |
|---|---|
| Texto completo: derecho a contraprueba de sangre (2 horas, media hora antes), prestadores integrales SNIS, copago base $1.600 actualizable, acta de control, extracción por técnico | **RAG** `06-alcohol-espirometria-controles` |

### Decisiones arquitectónicas

1. **Categoría nueva = ampliación del universo**: Tránsito no estaba en la taxonomía
   de 4 categorías. Se agregó como 5ª con fecha y nota en `dominio-consultas.md` §1.
2. **Sin subcategorías en v1** — corpus 100% transversal a nivel categoría. No hay
   régimen especial interno que exija partición (a diferencia de rural/call-center);
   con 9 documentos temáticos el retrieval por categoría alcanza. Partición propuesta
   al equipo legal.
3. **`caso-sensible` NO se extiende al agente tránsito**: el dominio no tiene el
   perfil de violencia/riesgo actual de familia; la emergencia de un siniestro
   reciente la cubre el protocolo del receptor antes de clasificar. Si el equipo
   legal define un protocolo de urgencia propio (p. ej. lesionado sin atención),
   se agrega entonces.
4. **Anti-fabricación reforzada en `conducta-transito`**: prohibiciones explícitas de
   atribuir culpa del siniestro, estimar indemnizaciones por lesión (baremo no
   disponible) y afirmar puntos del permiso (Decreto 181/025 no enviado) — los tres
   huecos reales del material recibido.
5. **Frase institucional Jurco** adaptada mecánicamente ("…en materia de tránsito");
   confirmación pedida al equipo legal (mismo trámite que familia).
6. `proceso-derivacion` (tool-skill) y `captacion-caso` (rule): contenido compartido,
   se agregó la clave `transito` (mismo texto).

## Archivos tocados

- Backend nuevo: `dominios/transito/` (clasificacion, rules `rol-especialista-transito`
  y `conducta-transito` [crítica], static-skill `dimensionar-transito`, instructions,
  agente) + tests; datasets `src/test/agents/transito/datasets/{citacion,voz-fuentes,captacion}.json`.
- Backend modificado: `models` (AgentId), `dominios/registry.ts` (CategoriaId +
  entrada), rules `identidad-jurco` y `captacion-caso`, tool-skill `proceso-derivacion`,
  registries de rules/skills, `mastra/index.ts`, `run-evals.ts` (+3 evals, regex),
  dataset del receptor (+4 ítems), tests de registry/api-dominios/rules/skills.
- Corpus: `backend/corpus/transito/generales/**` (9 archivos), ingestados a la base
  (idempotente por título; invisible al público hasta el deploy del agente).
- Docs: `dominio-consultas.md` (universo 4→5, sección Tránsito), CLAUDE.md (línea
  "Habilitado"), este plan, `docs/preguntas-legales/2026-07-31-transito.md`,
  material fuente en `docs/transito/`.

## Verificación

- `pnpm test`: 78/78 (20 archivos). `pnpm lint`: limpio.
- `pnpm evals` (suite completa contra DB Railway, corpus ingestado):
  - **Tránsito**: citación 8/8 (100%), voz-fuentes 4/4 (100%), captación 2/2 (100%).
  - **Receptor**: 30/30 (100%), incluidos los 4 ítems nuevos de clasificación tránsito.
  - **Familia sin regresión**: citación 8/8, voz-fuentes 4/4, captación 2/2.
  - **Laboral sin regresión**: citación 19/19, voz-fuentes 7/7, captación 3/3.
    **Fidelidad 5/6 (83%)** por el ítem trace-derived pre-existente
    (guardia/nocturnidad "desde la primera hora"), que oscila a `temperature: 1` —
    misma flakiness ya registrada en `2026-07-28-procesamiento-rural-call-center.md`
    y `2026-07-28-revision-feedback-federico.md`; reproducida 2/2 en esta rama, que
    no modifica el prompt ensamblado ni el corpus de laboral. No es regresión de
    este ciclo.

## Preguntas al equipo legal

En `docs/preguntas-legales/2026-07-31-transito.md` (enviable, estado PENDIENTE):
subcategorías propuestas; Decreto 181/025 (permiso por puntos) y baremos de lesiones
faltantes; límites de velocidad vigentes; categorías de licencia vigentes;
responsabilidad por daños materiales (derecho común) sin material; alcance de la vía
penal; copago vigente del examen de sangre; confirmación de la frase institucional.
Ninguna bloquea lo habilitado.
