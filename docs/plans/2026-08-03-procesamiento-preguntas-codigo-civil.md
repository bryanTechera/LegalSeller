# Procesamiento: "Preguntas y respuestas del Código Civil" (2026-08-03)

Registro del procesamiento (skill `procesar-documento-legal`) del Q&A que el equipo
legal envió el 2026-08-03: nueve consultas modelo con sus respuestas correctas sobre
"la categoría civil", motivado por **inconsistencias reportadas en las respuestas del
sistema en esa categoría**. Fuente: *Preguntas y respuestas del Código Civil* (.docx,
9 bloques de Q&A).

## Diagnóstico de las inconsistencias

En la taxonomía del sistema **no existe una categoría "civil"**. El material del Q&A se
reparte en dos mundos:

1. **Seis Q&A son de Familia** (divorcio y causales, adulterio, pensión entre
   excónyuges y su cese, filiación/impugnación, compraventa entre cónyuges) — área
   habilitada, con corpus que ya cubría la mayor parte. Ahí las inconsistencias
   posibles eran dos gaps puntuales del corpus (definición de adulterio; la acción de
   desconocimiento del art. 220), cerrados en este procesamiento.
2. **Tres Q&A son de derecho civil patrimonial** (responsabilidad por el hecho del
   dependiente art. 1324; venta de cosa perdida art. 1672; daños y perjuicios
   art. 1345) — **sin categoría destino**: ningún agente tiene ese corpus ni lo
   recuperaría. Este es el origen estructural de las inconsistencias: ante estas
   consultas el sistema improvisaba en vez de reconocer el tema como no cubierto.

**Refuerzo aplicado (mínimo y honesto)**: se declaró `civil` en el registry como
categoría **deshabilitada** (patrón "disabled categories inline"). Con eso
`<temas_aun_no_cubiertos>` del receptor deja de estar vacío y las consultas civiles
tienen ancla explícita para `categoria-no-habilitada` → el receptor lo dice con
honestidad y capta el contacto (rule `conduccion-triage`), que es el comportamiento
correcto del funnel. Habilitar el área de verdad requiere material del equipo legal
(síntesis + partición en subcategorías) — pedido en la pregunta 1 del archivo enviable.

## Triage por pieza

| # | Pieza (arts.) | Destino | Motivo |
|---|---|---|---|
| 1 | Causales de divorcio (187 + 148, lista de 10 numerales) | **DESCARTE para corpus** → evals | El corpus (`02-divorcio-tres-vias.md`) ya trae el art. 148 **consolidado vigente: 11 numerales** (el Q&A omite el 11, identidad de género, y la redacción 19.580 del numeral 3). Lo existente es más completo — confirmación pedida (pregunta 5) |
| 2 | Definición de adulterio (148 num. 1 + remisión 127 inc. 2) | **RAG** — reescrito en `02-divorcio-tres-vias.md` | No estaba: el corpus nombraba la causal sin la definición legal ni el cese de la obligación de fidelidad sin vida de consuno |
| 3 | Pensión entre excónyuges: requisito de duración y criterios (183) | **DESCARTE para corpus** → evals | `03-pension-entre-conyuges.md` ya lo cubre con más precisión (distingue inciso 1 "más de un año"/no culpable del inciso 2 "al menos un año"/tareas del hogar) |
| 4 | Cese de la pensión (194 + 183) | **DESCARTE para corpus** → evals | Ya cubierto en `03-pension-entre-conyuges.md` § Cese |
| 5 | Desconocimiento de la filiación legítima (220 + 46; posesión notoria sin el plazo del 47) | **RAG** — sección nueva en `04-filiacion-reconocimiento-apellidos.md` | Gap real: el corpus solo tenía investigación de paternidad (CNA 197-205) y la posesión notoria como prueba supletoria. Faltaba la acción del 220, su imprescriptibilidad para el hijo sin posesión de estado, y la distinción entre ambas acciones (el criterio del experto en el Q&A) |
| 6 | Investigación de paternidad, plazo 25 años (CNA 198) | **DESCARTE para corpus** → evals | Ya cubierto textual en `04-filiacion-reconocimiento-apellidos.md` |
| 7 | Responsabilidad por el hecho del dependiente (1324) | **NO ingerido** — sin categoría destino | Ningún agente lo recuperaría; Tránsito excluyó expresamente la responsabilidad civil entre particulares. Preguntas 1 y 2 del enviable. Cubierto por la declaración de `civil` deshabilitada |
| 8 | Venta de cosa perdida (1672) — compra a un particular por Mercado Libre | **NO ingerido** — sin categoría destino + frontera ambigua con Consumo | La respuesta del experto usa el C.C., no la Ley 17.250; la frontera particular/proveedor es una decisión de dominio → pregunta 3. Sin ítem de eval hasta la respuesta |
| 9 | Daños y perjuicios (1345) | **NO ingerido** — sin categoría destino | Concepto transversal del área civil no habilitada (pregunta 1) |
| 10 | Nulidad de compraventa entre cónyuges (el Q&A cita "1672") | **RAG** — sección nueva en `04-sociedad-conyugal-disolucion-liquidacion.md`, citado como **art. 1675** | La consulta llega como tema matrimonial/patrimonial (la clasifica Familia). **Erratum verificado contra el consolidado IMPO**: la regla está en el art. 1675; el 1672 es la venta de cosa perdida. Confirmación pedida (pregunta 4) |

Verificación textual: todos los artículos citados por el Q&A (46, 127, 148, 183, 187,
194, 220, 1324, 1345, 1672, 1675 C.C.; 198 CNA) se cotejaron contra los consolidados
IMPO ya recibidos (`docs/familia/Código Civil.pdf`, CNA). Fuera del erratum del 1675 y
las omisiones del art. 148, el Q&A es consistente con los textos vigentes.

## Cambios

- **Registry** (`backend/src/mastra/dominios/registry.ts`): categoría `civil` declarada
  con `habilitada: false`, sin señales ni subcategorías (partición pendiente del equipo
  legal). `CategoriaId` extendido; `registry.test.ts` actualizado (6 en el universo, 5
  habilitadas). `api-dominios` no cambia (expone solo habilitadas).
- **Corpus familia** (3 documentos re-ingestados por título, upsert):
  - *Divorcio: las tres vías…* — definición legal de adulterio (4 chunks).
  - *Filiación, reconocimiento y apellidos* — sección "Desconocimiento de la filiación
    legítima": art. 220, posesión notoria del art. 46 sin el plazo del 47, efecto del
    acogimiento, distinción con investigación de paternidad (4 chunks).
  - *Sociedad conyugal: disolución y liquidación* — sección "Compraventa entre
    cónyuges": nulidad art. 1675, alcanza a la venta que encubre otro negocio (2 chunks).
- **Docs**: `docs/dominio-consultas.md` §1 (universo 5+1, sección Civil).
- **Receptor** (fixes salidos del diagnóstico de evals, sección siguiente):
  `universo-categorias` renderiza las subcategorías habilitadas con su descripción;
  guard del escape en `conduccion-triage`; "filiación (reconocimiento, impugnación,
  investigación de paternidad)" en la descripción de familia; señal de trabajo
  doméstico en laboral; límite "no comprende asuntos de familia" en civil.
- **Evals**:
  - Receptor `clasificacion.json`: +4 ítems — causales de divorcio y pensión del
    excónyuge (→ `familia/divorcio-sociedad-conyugal`), filiación a los 30 años
    (→ `familia` transversal), préstamo entre particulares (→ `categoria-no-habilitada`,
    primer ítem del golden set que ejercita ese escape).
  - Familia `citacion.json`: +2 ítems (filiación; compraventa entre cónyuges).
  - Familia `fidelidad.json` (**dataset nuevo**, cableado en `run-evals.ts` como
    `familia-fidelidad`): 6 ítems derivados de las respuestas correctas del Q&A —
    umbral de un año de la pensión, imprescriptibilidad del 220, plazo de 25 años de la
    investigación de paternidad, nulidad + separación de cuerpos en la compraventa entre
    cónyuges, adulterio con persona del mismo sexo, cese de la pensión por concubinato.

## Preguntas al equipo legal

Archivo enviable: `docs/preguntas-legales/2026-08-03-preguntas-codigo-civil.md`
(PENDIENTE). Resumen: (1) ¿habilitar área Civil? — alcance, subcategorías y síntesis;
(2) empleador demandado por el hecho del dependiente: ¿Tránsito o Civil?; (3) compras
entre particulares: ¿Consumo o Civil? y criterio proveedor/particular; (4) confirmación
del erratum 1675 vs 1672; (5) confirmación de las once causales vigentes del art. 148.

## Primera corrida de evals: hallazgos y fixes (Define → Test → Diagnose → Fix)

La primera corrida (receptor 42/47 = 89%, familia fidelidad 5/6 = 83%) dejó hallazgos
reales — el "testeo en profundidad" pedido. Contexto relevante: desde el PR #21
(2026-08-02) el receptor corre `gemini-3.5-flash-lite` por latencia, lo que correlaciona
temporalmente con el reporte de inconsistencias del equipo legal.

1. **La pensión del excónyuge se clasificaba en `pension-tenencia-visitas`** (confianza
   alta) cuando la taxonomía la asigna a `divorcio-sociedad-conyugal`. Causa raíz: el
   schema de `asignar-clasificacion` solo expone los **IDs** de subcategoría — el
   receptor nunca veía las descripciones y adivinaba la frontera por el nombre
   ("pension…" gana). Con la subcategoría equivocada, el filtro de retrieval del
   especialista deja fuera el documento de pensión entre cónyuges: **mecanismo
   plausible de las inconsistencias reportadas**. Fix: `universo-categorias` ahora
   renderiza las subcategorías habilitadas con su descripción.
2. **La entrada nueva "Civil" sobre-disparaba `categoria-no-habilitada`**: se llevó
   puesta la impugnación de filiación (que ES de familia) y a la empleada doméstica
   (laboral). Fixes: límite explícito en la descripción de civil ("no comprende los
   asuntos de familia…"), "filiación (reconocimiento, impugnación, investigación de
   paternidad)" en la descripción de familia, y guard en `conduccion-triage`
   (reservar el escape para temas que ninguna categoría habilitada cubre; un régimen
   especial no listado sigue siendo de su categoría).
3. **Matcher de fidelidad demasiado literal**: la respuesta real del agente (bien
   fundada en el corpus nuevo) dice "del mismo o **de distinto** sexo"; el ítem
   esperaba "mismo sexo". Calibrado sobre la traza real con las variantes válidas
   (guía eval-design: `contieneAlguno` = mismo hecho, varias redacciones).
4. Dos fallas de la primera corrida ("reclamo chico" → subcategoría de consumo
   equivocada; "tengo un problema" → clasificó en vez de preguntar) **pasaron en la
   segunda sin cambios**: varianza del receptor lite, no regresión.
5. **La empleada doméstica escapó a `categoria-no-habilitada` en las dos corridas**
   (persistente, no ruido): el receptor la lee como "régimen especial no listado",
   como rural o call-center. El golden set define `laboral/despido`. Fix: señal
   explícita en la categoría laboral ("trabaja en una casa de familia… es laboral
   aunque el régimen doméstico no aparezca como subcategoría").

Segunda corrida: **receptor 46/47 (98%)** — pasan la pensión del excónyuge, la
filiación a los 30 años y el préstamo civil (escape correcto a
`categoria-no-habilitada`) — y **familia fidelidad 6/6 (100%)**.

## Resultados de evals (corrida final)

- Receptor clasificación: **45/47 (96%)**, threshold 90% — la empleada doméstica ya
  clasifica `laboral/despido`. Las 2 fallas son los ítems `pregunta:true` ("hola",
  "tengo un problema"), que oscilan entre corridas desde antes de este cambio:
  el receptor lite a veces clasifica `fuera-de-universo` con confianza baja en vez de
  preguntar ante mensajes sin contenido. **Observación abierta** para la próxima
  iteración del receptor (no se tocó acá: ítems preexistentes, gate verde).
- Familia: citación 10/10 · voz-fuentes 4/4 · captación 2/2 · **fidelidad 6/6**.
- `pnpm test` 96/96 · `pnpm lint` limpio.
