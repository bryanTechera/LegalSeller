# Procesamiento del anexo laboral (2026-08-06)

Material recibido del equipo legal en `docs/laboral/anexo/` (19 PDFs). Procesado con la skill `procesar-documento-legal`. Preguntas abiertas en `docs/preguntas-legales/2026-08-06-anexo-laboral.md`.

## Lectura (fase 1)

- **Leídos completos**: los 17 documentos normativos (leyes y decretos, 2-14 páginas cada uno) y el **Manual de materia gravada BPS 2024** (212 págs.).
- **Texto ordenado tributario de seguridad social BPS 2025** (477 págs.): leído el índice completo, los títulos preliminar y I, y **todas las secciones con contenido cara-consultante** (teletrabajo, plataformas, no dependientes, trabajo doméstico, trabajo a domicilio, asistentes personales, compatibilidad jubilación-actividad, solidaridad/tercerización, historia laboral, infracciones y sanciones, fondo de garantía de créditos laborales). El resto se verificó por muestreo contra el manual de materia gravada: es la versión fuente-por-fuente del mismo cuerpo normativo (mismo emisor BPS, mismos capítulos 1:1), cuya versión didáctica se leyó entera. Desviación deliberada de la lectura línea a línea, registrada acá; el alcance esperado de ambos compendios va como pregunta 1 al equipo legal.

## Triage e implementación (fases 2-5)

### Subcategorías nuevas (registry + corpus)

| Subcategoría | Fuentes | Corpus |
|---|---|---|
| `seguro-desempleo` (no particionada; anclada en `dimensionar-despido`) | DL 15.180 (red. L 18.399) + Dec 162/009 + L 18.399 | 5 docs: qué es/causales, requisitos/plazo, duración/monto, exclusiones/cese, despido ficto/efectos |
| `teletrabajo` (particionada — horas extras semanales contradicen el régimen general) | L 19.978 | 2 docs: concepto/acuerdo/reversibilidad, jornada/desconexión/seguridad |
| `plataformas-digitales` (particionada) | L 20.396 + Dec 145/025 | 3 docs: ámbito/calificación del vínculo, algoritmos/bloqueo de cuenta/derechos comunes, tiempo de trabajo/retribución/autónomos |

### Ampliaciones de subcategorías existentes

- `licencias-especiales/08-controles-embarazo.md` — L 20.129 (red. L 20.212). Descripción de la subcategoría ampliada en `clasificacion.ts`.
- `rubros-laborales/23-propinas-medios-electronicos.md` — L 20.243.
- REWRITE `rubros-laborales/08-aguinaldo-partidas-egreso.md`: + no acumulación (art. 5 L 12.840) y multa por incumplimiento (art. 7).
- REWRITE `rubros-laborales/04-licencia-remuneracion.md`: + reajuste durante la licencia y reliquidación de diferencias del último año (arts. 3 y 4 L 13.556).

### Corpus transversal nuevo (`generales/`, `subcategoria = NULL`)

- `06-tercerizaciones-responsabilidad.md` — L 18.099 + L 18.251 (solidaria/subsidiaria, alcance, piso salarial de suministrados, prohibición de reemplazo).
- `07-fondo-garantia-creditos-laborales.md` — L 19.690 + Dec 77/019 (extraído del texto ordenado BPS).
- `08-recibo-de-sueldo.md` — art. 10 L 16.244 (red. L 20.075: 50 % de la multa para el trabajador denunciante) + Dec 278/017 (extraído del texto ordenado BPS).
- `09-historia-laboral-trabajo-no-registrado.md` — arts. 77, 77 bis, 86-91 L 16.713 (red. L 20.130): dependiente no responsable de aportes no vertidos, derecho de iniciativa, observación, triple indemnización por despido-represalia, plazos pre-1996 (prórroga Dec 107/025). Extraído del texto ordenado BPS.
- `10-construccion-cargas-salariales-bps.md` — DL 14.411 + Dec 951/975 + manual BPS cap. VI: kernel cara-consultante (licencia/aguinaldo/salario vacacional los abona BPS; pequeñas obras de mantenimiento por régimen común).

### Prompts (skills/rules)

- `regimenes-especiales.ts`: de 2 a 4 regímenes (+ teletrabajo, + plataformas; incluye la distinción teletrabajo ≠ trabajo por apps). Sin números normativos (test ampliado).
- `dimensionar-despido.ts`: heurística de seguro de desempleo ante despido/suspensión (plazo perentorio, iniciativa del trabajador si la empresa no da los formularios, despido ficto como señal de indemnización). El dato exacto del plazo vive en el corpus.
- `conducta-laboral.ts`: el bullet de regímenes especiales pasa a nombrar los cuatro y sus condiciones de filtrado.
- `clasificacion.ts`: 3 subcategorías nuevas + 3 señales nuevas del receptor (seguro de paro; apps de reparto/viajes; teletrabajo) + descripción de licencias-especiales con controles de embarazo.

### Evals

- `retrieval/datasets/laboral.json`: +15 ítems (3 seguro-desempleo, 2 teletrabajo, 2 plataformas, 1 controles de embarazo, 1 propinas, 5 transversales, 1 negativo nuevo) y 1 reclasificado.
- `recepcion/datasets/clasificacion.json`: +3 ítems (app de delivery, seguro de paro, teletrabajo) — solo categoría, como los ítems de rural/call-center.

### Recalibración del umbral laboral (0.717 → 0.693)

El corpus nuevo movió la escala del golden set y obligó a recalibrar `minSimilarityPara("laboral")` con el procedimiento del 2026-08-04 (punto medio piso-de-positivos/techo-de-negativos), todo medido con similitudes crudas:

- **Positivos nuevos**: piso 0.703 ("me bloquearon la cuenta de la app"); el resto entre 0.727 y 0.830.
- **Negativos**: techo 0.683 ("pasante" contra despido-enfermedad). Umbral nuevo: **0.693** (margen ±0.010, el segundo más fino después de tránsito).
- **Ítem reclasificado**: "empresa extranjera 100 % remota" era un negativo (vacío correcto) diseñado cuando no había corpus de teletrabajo; hoy su vecino más cercano es `Teletrabajo — Concepto…` (0.703) y ese material ES la respuesta parcial pertinente → pasó a positivo. Se repuso un negativo genuinamente fuera de corpus ("quiero poner una empresa unipersonal", techo 0.621 — de paso documenta la exclusión deliberada de monotributo).
- **Gap conocido y aceptado** (documentado también en el comment del umbral): las fraseologías coloquiales de micro-escenario ("¿me pagan el viaje si el cliente lo cancela?") puntúan 0.63-0.68 contra su doc correcto — el doc rankea PRIMERO pero debajo de todo umbral viable, así que hoy devuelven vacío. Es un problema de escala de la consulta (candidato a expansión de query), no de ranking: reranking sigue descartado (recall@20−recall@5 = 0 también acá). El ítem de plataformas se sondea con la consulta de horas/mínimo (0.801).

Resultado: `pnpm evals retrieval` verde en las 5 categorías (laboral recall@5 = 1.000, vacío-correcto = 1.000, 27 positivos / 4 negativos; las otras cuatro categorías sin cambios).

## Descartes (con motivo)

- **L 16.101 arts. 1-3** (registro de empresas de turismo social): sin relación con consultas laborales; los arts. 4-5 (salario vacacional) ya estaban cubiertos por el corpus de rubros — la ley nueva es la fuente de lo ingerido el 2026-07-19, sin delta.
- **L 12.840 / L 13.556 (cuerpo principal)**: DISCARD por "igual de preciso" — el corpus de rubros ya cubre concepto, cálculo, partidas, egreso, notoria mala conducta (aguinaldo) y cómputo/jornal de vacaciones (licencia). Solo se sumaron los deltas listados arriba. **L 13.556 art. 1** (representatividad sindical para convenios): materia colectiva, fuera del perfil de consulta individual.
- **L 18.399**: sus artículos son redacciones ya integradas al texto actualizado del DL 15.180; los propios (imputación de adeudos hasta 70 %, registro público de suspensiones) quedaron dentro de los docs de seguro-desempleo.
- **Compendios BPS como corpus íntegro**: NO se ingieren — material del contribuyente/empleador (monotributo, fictos de no dependientes, SAS, exoneraciones, facilidades de pago, prescripción tributaria, infracciones del empleador, IRPF, AFAP/regímenes jubilatorios, SNIS/Fonasa, cooperativas, zonas francas, fomento del empleo, compatibilidad jubilación-actividad): audiencia distinta a la del funnel (consultante trabajador) y contaminaría el retrieval. Se extrajeron las 4 piezas cara-consultante listadas en transversal. Pregunta 1 al equipo legal por el alcance esperado.
- **DL 15.084 (asignaciones familiares)**: EN ESPERA — el régimen dominante vigente (AFAM-PE L 18.227) y la L 17.474 no vinieron; ingerir solo el régimen contributivo de 1980 (con sus subsidios de maternidad derogados por L 19.161) induciría respuestas incompletas. Pregunta 2.
- **Trabajo doméstico (L 18.065 parcial, vía texto ordenado)**: EN ESPERA — artículos sueltos no alcanzan para un régimen completo; el despido doméstico ya está cubierto (`despido/18-domestica.md`). Pregunta 5.
- **Trabajo a domicilio (L 9.910 / L 18.846)**: régimen real pero muy nicho (talleristas de la vestimenta), sin subcategoría ni demanda registrada; mencionado en la pregunta 5 por si el equipo legal quiere habilitarlo.
- **Manual BPS: "aplicaciones móviles" (choferes como unipersonales)**: contradicho por la L 20.396 (posterior, feb 2025) que admite dependientes — se siguió la ley, no el manual (edición dic 2024).

## Verificación (fase 6)

- `pnpm corpus:sync` contra la base local (los 17 docs nuevos + 2 modificados); la ingesta a producción queda para el flujo post-merge.
- `pnpm test`, `pnpm lint`, `pnpm evals retrieval` (gate por categoría), `pnpm evals clasificacion` (receptor con los 3 ítems nuevos). Resultados en el PR.
- Nota sobre el golden set: el ítem de vacío correcto "empresa extranjera 100 % remota" se re-evaluó tras ingresar el corpus de teletrabajo (ver resultado de evals en el PR).
