# Procesamiento de DESPIDO.pdf (equipo legal) — 2026-07-19

Primer documento real del equipo de expertos legales, procesado con la skill
`procesar-documento-legal` (`.claude/skills/`). Fuente: `docs/despido/DESPIDO.pdf`
(50 páginas, tratado sobre despido en Uruguay). Este registro documenta piezas,
destinos, descartes con motivo, preguntas abiertas al equipo legal y evals agregadas.

## Piezas y destinos

### RAG (19 piezas → 19 documentos, categoria `laboral`, subcategoria `despido`)

Todo el material normativo/jurisprudencial/doctrinario es citable → corpus RAG.
Fuentes curadas en `backend/corpus/laboral/despido/*.md` (re-ingestables con
`pnpm ingest`, idempotente por título). 84 chunks en pgvector, todos `READY`.

| # | Pieza | Título del documento |
|---|---|---|
| 01 | Tipologías de extinción y causas ajenas | Despido — Extinción del contrato de trabajo: tipologías y causas ajenas a la voluntad |
| 02 | Renuncia y abandono | Despido — Renuncia y abandono del trabajador |
| 03 | Modalidades de despido | Despido — Modalidades de despido |
| 04 | Notoria mala conducta | Despido — Notoria mala conducta |
| 05 | Cálculo IPD mensual | Despido — Cálculo de la indemnización: trabajador mensual |
| 06 | Cálculo IPD jornalero/destajista | Despido — Cálculo de la indemnización: jornalero, destajista y por hora |
| 07 | Despido abusivo | Despido — Despido abusivo y daño moral |
| 08 | Protección de la maternidad (normativa) | Despido — Protección de la maternidad ante el despido: normativa |
| 09 | Subsidio por maternidad BPS | Despido — Subsidio por maternidad (BPS): condiciones y trámite |
| 10 | Indemnización especial por gravidez | Despido — Indemnización especial por gravidez: requisitos, exoneraciones y estabilidad |
| 11 | Despido especial por enfermedad común | Despido — Despido especial por enfermedad común |
| 12 | Despido especial por accidente/enf. profesional | Despido — Despido especial por accidente de trabajo o enfermedad profesional |
| 13 | Despido especial por acoso sexual | Despido — Despido especial por acoso sexual |
| 14 | Violencia de género y estabilidad | Despido — Despido y violencia de género: estabilidad laboral |
| 15 | Trabajo nocturno | Despido — Trabajo nocturno y despido |
| 16 | Trabajador con discapacidad | Despido — Despido del trabajador con discapacidad |
| 17 | Viajantes y vendedores de plaza | Despido — Viajantes y vendedores de plaza |
| 18 | Rural y doméstica | Despido — Trabajador rural y trabajadora doméstica |
| 19 | Fiscal (IRPF) y ad nutum | Despido — Tratamiento fiscal (IRPF) y despido ad nutum |

La pieza 09 (subsidio maternidad, material administrativo BPS) se etiqueta
`despido` — no `licencias-especiales` (deshabilitada) — porque sostiene las
conversaciones de despido por gravidez ("me despidieron embarazada, ¿y mi
licencia?") y el filtro de retrieval del laboral es por subcategoría habilitada.

**Curación**: fan-out de 19 curadores + 19 verificadores (limpieza mecánica de
artefactos de PDF, contenido verbatim). Fidelidad verificada por dos vías
independientes: veredicto adversarial por pieza (19/19 fiel) y diff de multiset
numérico fuente↔curado (cero números agregados; todos los faltantes son
marcadores de nota al pie o encabezados de corrida documentados).

### Skill (1 nueva)

- `dimensionar-despido` (static, solo `laboral`, tag `<dimensionar_despido>`):
  heurísticas de práctica — datos para dimensionar (forma de remuneración,
  antigüedad, remuneración completa, forma del cese), "no todo cese es despido",
  señales de despidos especiales (embarazo, enfermedad/accidente, acoso,
  violencia de género, discapacidad, nocturno, doméstica, rural, viajante) y
  carga de la prueba en notoria mala conducta. Sin citas normativas embebidas:
  los números viven en el RAG (litmus de la taxonomía). Registrada al final del
  bloque de conocimiento, antes de `<captacion>` (recencia intacta).

### Rules

Ninguna nueva ni modificada: `conducta-laboral` ya exige corpus + citación y el
documento no trae restricciones de comportamiento nuevas (ELIMINAR > REESCRIBIR >
CONDENSAR > AGREGAR — nada que agregar a nivel rule).

## Descartes y correcciones documentadas

1. **Oración final del PDF (p. 50) descartada de la pieza 19**: "También es
   pacífica la postura... despido triple... agotamiento del contrato" — duplicado
   fuera de contexto; ya está verbatim en la pieza 12 (su lugar correcto). En la
   pieza 19 (fiscal/ad nutum) solo contaminaría el retrieval.
2. **Errata corregida en pieza 04**: la fuente dice "el empleador —como se dijo—
   pierde la indemnización por despido"; la enumeración es explícitamente
   "consecuencias... para el trabajador" y la misma pieza cita la ley 12.597 art.
   10 ("Todo trabajador que fuera despedido por notoria mala conducta, no tendrá
   derecho a indemnización"). Corregido a "el trabajador" como reparación de
   transcripción (consistencia interna del propio documento). **Pendiente de
   confirmación del equipo legal** (pregunta 1).
3. **Párrafo duplicado consecutivo colapsado en pieza 01** (artefacto de corte de
   página 1→2, versión completa conservada).
4. Erratas menores de la fuente **mantenidas tal cual** y anotadas (pregunta 7).

## Preguntas abiertas al equipo legal

1. Confirmar la corrección de la errata de notoria mala conducta (quien pierde la
   indemnización es el **trabajador**, no el empleador) — pieza 04.
2. p. 20: la lista de normativa de gravidez incluye "ley 19.161 de 15 de noviembre
   de 2023". La 19.161 es de 2013 (subsidios por maternidad/paternidad). ¿Número o
   fecha equivocados? ¿A qué norma se refiere?
3. p. 42: "La ley 19.161 que entró en vigencia el 18/11/2018" para cuotas de
   personas con discapacidad — ¿debería decir **19.691**? (El propio documento
   luego cita el art. 9 de la 19.691.)
4. Pieza 01: dos oraciones truncadas en la fuente — "Es criterio firme que al no
   existir propiamente un despido." (falta la consecuencia; ¿que no genera IPD el
   vencimiento natural del contrato temporal?) y "Sin embargo, no debe perderse de
   vista." (incapacidad prolongada). Pedir el texto completo.
5. **Despido vinculado a violencia de género en el agente laboral**: el protocolo
   de caso sensible vive hoy solo en el receptor. Una consulta de despido tras
   medidas cautelares (art. 40 ley 19.580) que llega al laboral, ¿se atiende con
   respuesta informativa estándar + captación, o amerita contención/derivación
   especial también ahí? (Relacionado: `docs/dominio-consultas.md` §4.)
6. Alícuota de salario vacacional del jornalero: la fuente alterna 0,066 / 0,0666 /
   0,0667 en fórmula y ejemplos. ¿Factor de referencia a comunicar?
7. Erratas menores mantenidas tal cual en el corpus (confirmar si corrigen el
   material fuente): "el pacto pactado" (p. 2), "la obra en contracción" (cita TAT
   3.º, p. 2), "dentro de los diez y siguientes" —falta "días"— (p. 9), "las primar
   por presentismo" (p. 11), "inclusión... resulta mandataria" (p. 12), "en casa de
   notoria mala conducta" (p. 8), "(con asistencia de su legal)" (p. 5).

## Evals agregadas (el gap que vino a cerrar el documento)

- **Receptor** (`clasificacion.json`, 12 → 15 items): 3 relatos de despidos
  especiales que antes no tenían cobertura — embarazada despedida, despido tras
  licencia por enfermedad, empleada doméstica.
- **Laboral citación** (`agents/laboral/datasets/citacion.json`, nuevo, 4 items):
  toda pregunta sustantiva de despido debe disparar `buscar-documentos` antes de
  responder (la mitad programática de "SIEMPRE citar la fuente"). Runner extendido
  con gate dual: ambos datasets ≥ 0.9 o exit 1.

## Cambios de infraestructura arrastrados

- **Byte-gate eliminado** (`src/test/instructions-migracion.test.ts` + fixture):
  este es el primer cambio deliberado de contenido del prompt; per su ciclo de
  vida documentado el gate se elimina — no se "arregla" — y `pnpm evals` pasa a
  ser el gate de contenido.

## Verificación

- `pnpm test`: 47/47 · `pnpm lint`: limpio.
- `pnpm evals`: receptor 15/15 (100%), laboral citación 4/4 (100%).
- Smoke test de retrieval: 6 consultas representativas recuperan el documento
  correcto con similitud 0.75–0.84.
- Auditoría del prompt ensamblado del laboral: orden primacy→recencia intacto,
  sin contradicciones skill↔rules, sin colisiones tag↔tool.
