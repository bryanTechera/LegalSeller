# Procesamiento — Trabajador rural (DL 14.785 + Decreto 216/012) y Call center (Decreto 147/012) — 2026-07-28

Cuarto lote de material del equipo de expertos legales, procesado con la skill
`procesar-documento-legal`. Extracción de texto con pypdf (mismo método que los lotes
anteriores; no había poppler para render de páginas). Fuentes en `docs/laboral/`:

| Documento | Páginas | Tema |
|---|---|---|
| `Decreto Ley N° 14785.pdf` | 4 | Estatuto del Trabajador Rural (norma base, 1978) |
| `Decreto N° 216_012 ...ESTATUTO DEL TRABAJADOR RURAL. ACTUALIZACIÓN.pdf` | 8 | Reglamentación vigente del estatuto rural (2012) |
| `Decreto 147_012.pdf` | 8 | **Call center** (centros de atención telefónica): condiciones/ambiente + jornada especial |

Nota: el archivo `Decreto 147_012.pdf` no es rural pese a venir en el mismo lote — su
contenido es el régimen de los operadores de centros de atención telefónica.

## Decisión de alcance (gate con el equipo de producto)

Ninguna de las dos materias figuraba en la taxonomía habilitada (`docs/dominio-consultas.md`
tenía solo Despido + Rubros laborales en Laboral). Ambas son **regímenes especiales** que
difieren del régimen general, por lo que ingerirlas al corpus general arriesgaba
contaminación (dar la licencia/jornada/feriados rurales, o el límite de 39 h del call
center, a un trabajador común). Se resolvió el alcance antes de implementar:

- **Trabajador rural → nueva subcategoría particionada** (`trabajador-rural`).
- **Call center → habilitar como tema nuevo** (`call-center`), también particionado.

Ambas son subcategorías de **Laboral**: las maneja el agente `laboral` existente, sin
agente nuevo. El particionado se sostiene con una directiva en la rule `conducta-laboral`
(filtrar la subcategoría especial solo cuando el consultante encuadra en ese régimen).

## Piezas y destinos

### RAG — `trabajador-rural` (6 piezas)

Curadas en `backend/corpus/laboral/trabajador-rural/*.md`, basadas en el Decreto 216/012
(reglamentación vigente, que derogó el 647/978) y el DL 14.785 (estatuto). Contenido
normativo reformulado en prosa natural, sin artefactos de IMPO, con cita de artículo/norma.

| Pieza | Contenido | Fuente |
|---|---|---|
| `01-salario-pago` | Definición de empleador/trabajador rural; retribución y salario mínimo (Consejos de Salarios); pago en dinero sin deducciones; plazos de pago; documentación | 216 arts 1-3,5; 14.785 arts 1-4 |
| `02-vivienda-alimentacion-asistencia` | Prestaciones de vivienda y alimentación (integran el aguinaldo por ficto); cese descendientes 21/18; higiene, agua, combustible; asistencia médica | 216 arts 4-15; 14.785 arts 5,8,9 |
| `03-jornada-descansos` | Jornada 8 h/48 h; descanso intermedio ≥30 min remunerado; descanso entre jornadas ≥12 h (≥9 h si intermedio ≥3 h); descanso semanal | 216 arts 16-17 |
| `04-licencia-salario-vacacional-feriados` | Licencia anual 20 días + antigüedad + 100 % salario vacacional + cómputo de prestaciones; fraccionamiento ≥5 días; feriados pagos | 216 arts 18-20; 14.785 art 6 |
| `05-seguridad-salud` | Deber de seguridad del empleador; derechos del trabajador; EPP/cargas; edad mínima 18 para tareas peligrosas | 216 arts 21-25 |
| `06-despido-rural` | Despido = régimen general + particularidades (permanencia por enfermedad, traslado, mejoras/animales, no deducción por pastoreo); desalojo como ocupante precario; infracciones | 216 arts 26-29; 14.785 arts 10-13 |

**Movimiento (evita duplicación):** el despido rural ya vivía resumido en
`corpus/laboral/despido/18-rural-domestica.md` (junto con doméstica). Se **movió** la parte
rural a `trabajador-rural/06-despido-rural.md` y el archivo de despido quedó como
`18-domestica.md` (solo trabajadora doméstica). El régimen doméstico sigue siendo especial
sin subcategoría propia (pre-existente, fuera del alcance de este lote).

> **Cleanup de prod al re-ingestar**: el título del doc cambió de "Despido — Trabajador
> rural y trabajadora doméstica" a "Despido — Trabajadora doméstica". Como `pnpm ingest`
> es idempotente por título (`ON CONFLICT (title)`), el título viejo NO se sobreescribe:
> hay que **borrar** en la DB el `Document` "Despido — Trabajador rural y trabajadora
> doméstica" (y sus chunks) para que no quede huérfano duplicando el régimen rural.

### RAG — `call-center` (3 piezas)

Curadas en `backend/corpus/laboral/call-center/*.md` desde el Decreto 147/012.

| Pieza | Contenido | Fuente |
|---|---|---|
| `01-jornada-descansos` | Definición del sector; límite 39 h/6 días y jornada 6 h 30 (incluye 30 min intermedio + 10 min complementario); redistribución del sexto día (≤7 h 30, sin afectar salario); descanso entre jornadas ≥12 h; pausa 5 min en horas extra; pausas entre llamadas | arts 3,35-39 |
| `02-condiciones-ambiente-ergonomia` | Ambiente (iluminación, temperatura, humedad, ruido); ergonomía (pantalla, silla, mesa); auriculares/vinchas gratis e higienizadas; controles médicos; áreas de descanso | arts 4-9,15-27,30-32,20 |
| `03-escucha-auditoria-capacitacion` | Información sobre la escucha; derecho a ser informado ante consideración desfavorable (48 h sin grabación / 12 días con grabación y acceso a ella); capacitación | arts 33-34 |

### Skill — `regimenes-especiales` (static, laboral)

`backend/src/mastra/dominios/laboral/static-skills/regimenes-especiales.ts`: heurística de
reconocimiento (cómo saber que el consultante es rural o de call center) y qué relevar.
Sin números normativos (viven en el corpus). Registrada en `skills/index.ts` en la zona de
conocimiento.

### Rule — `conducta-laboral` (cláusula anti-contaminación)

Nueva directiva: filtrar `trabajador-rural`/`call-center` solo cuando el consultante
encuadra en ese régimen; para el trabajador común, no incluir esas subcategorías (sus
condiciones no rigen y afirmarlas sería incorrecto). Es el sostén de comportamiento del
particionado que pidió el gate de alcance.

### Registry y taxonomía

- `laboral/clasificacion.ts`: dos subcategorías `habilitada: true` + dos señales nuevas
  (rural, call center). Fluye solo a la skill `subcategorias-laboral`, a
  `subcategoriaAsignableSchema` y al payload de `/api/dominios`.
- `docs/dominio-consultas.md`: dos filas nuevas en la tabla Laboral, Estado 2026-07-28.

### Descartes documentados

- Del Decreto 147/012 no se cargó el detalle regulatorio fino de infraestructura edilicia
  (alturas, cubaje, cableado — arts 10-14) ni las sanciones administrativas (art 41): no
  orientan al consultante ni sostienen el funnel. Se conservaron ambiente/ergonomía en la
  medida en que responden "¿mis condiciones son legales?".
- Del régimen rural no se cargó el contralor administrativo (216 arts 30-32, comunicación
  por autoridad policial) ni el housekeeping legislativo (derogaciones).

## Auditoría del prompt ensamblado

`buildLaboralInstructions(null)` (13.633 chars): las 4 subcategorías presentes;
`<regimenes_especiales>` en la zona de conocimiento (antes de `<captacion>` final); sin
colisión tag↔tool; la cláusula anti-contaminación en `<reglas>` no contradice a
`subcategorias-laboral` ("determiná y registrá la subcategoría") — una dice qué registrar,
la otra por qué filtro buscar.

## Evals agregadas (el gap que vino a cerrar el lote)

- **Receptor clasificación** (`clasificacion.json`, 24 → 26): rural y call center rutean a
  `laboral` (nivel 1; sin aserto de subcategoría — la resuelve el agente).
- **Laboral citación** (`citacion.json`, 15 → 19): relatos rural (despido, licencia) y call
  center (jornada, escucha) que deben disparar `buscar-documentos`.
- **Laboral fidelidad** (`fidelidad.json`, 2 → 5): el gap central del particionado —
  (a) un trabajador de comercio NO debe recibir el límite de 39 h del call center
  (`prohibido`); (b) un operador de call center SÍ recibe las 39 h; (c) un peón rural SÍ
  recibe la incidencia de vivienda/alimentación en el aguinaldo. (b) y (c) validan
  end-to-end el retrieval de las subcategorías nuevas (requieren corpus ingestado).

## Ambigüedad legal → derivada al equipo (no asumida)

`docs/preguntas-legales/2026-07-28-rural-call-center.md`:
1. **Art. 1 del Decreto 147/012 modificado por el Decreto 143/017 (2017)** — no tenemos el
   texto vigente del ámbito de aplicación (a qué empresas alcanza). El corpus carga la
   definición de "centro de atención telefónica" (art 3, sin modificar) y evita afirmar el
   universo de empresas del art 1. **Bloquea la precisión del alcance del call center.**
2. **Vigencia del régimen rural** post-2012 (jornada por Ley 18.441, laudos de los Consejos
   de Salarios rurales): confirmar que el compendio del Decreto 216/012 sigue siendo el
   marco actual.

Ninguna bloquea el uso del material ya cargado.

## Verificación

- `pnpm test`: 71/71 (19 archivos; +1 archivo de test de la skill nueva). Se ajustaron los
  tests de enumeración (`registry.test.ts`, `skills/index.test.ts`, `api-dominios.test.ts`)
  por las subcategorías/skill nuevas.
- `pnpm lint`: limpio.
- **Ingesta (DB Railway):** las 9 piezas nuevas + re-ingest de `18-domestica.md`, todas
  `READY`. Se borró el `Document` huérfano "Despido — Trabajador rural y trabajadora
  doméstica" (3 chunks) por el cambio de título. Estado final del corpus laboral:
  despido 19 · rubros-laborales 23 · transversal (NULL) 5 · **trabajador-rural 6** ·
  **call-center 3**; 0 chunks huérfanos.
- `pnpm evals`:
  - Receptor clasificación **26/26 (100%)** — rural y call center rutean a laboral.
  - Laboral citación **19/19 (100%)** — incluye los 4 relatos rural/call center nuevos.
  - Laboral voz-fuentes **6/6**, captación **3/3**.
  - Laboral fidelidad: los **3 ítems anti-contaminación nuevos pasan en todas las corridas**
    (comercio sin las 39 h del call center; call center con las 39 h; rural con la
    incidencia de vivienda/alimentación en el aguinaldo). El dataset oscila 4/5–5/5 por
    **flakiness pre-existente** de los dos ítems trace-derived previos (BSE-"triple" y
    nocturnidad-"desde la primera hora"): a `temperature: 1` falla uno u otro de forma no
    determinista, o pasa 5/5. No es regresión de este lote (mis adiciones subieron el piso
    del dataset de 2 a 5 ítems). La estabilización de esos dos ítems (p. ej. reintentos o
    scorer con CI) queda como trabajo aparte de eval-design, fuera del alcance de este
    procesamiento.
