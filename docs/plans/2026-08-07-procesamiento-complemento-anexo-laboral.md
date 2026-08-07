# Procesamiento del complemento del anexo laboral (2026-08-07)

Material recibido del equipo legal el 2026-08-07: las **respuestas a las 7 preguntas** de `docs/preguntas-legales/2026-08-06-anexo-laboral.md` (archivo ahora RESPONDIDA, con las respuestas transcritas) y **10 normas complementarias** en `docs/laboral/` (Leyes 18.227, 17.474, 19.161 y 18.065; Decretos 322/008, 239/015, 437/002, 17/014, 224/007 y 86/022). Procesado con la skill `procesar-documento-legal`. Preguntas que quedaron abiertas: `docs/preguntas-legales/2026-08-07-complemento-anexo-laboral.md`.

## Lectura (fase 1)

Leídas completas las 10 normas nuevas (2 a 11 páginas cada una) más la relectura del Decreto-Ley 15.084 del anexo (en espera desde el 2026-08-06, ahora incorporado).

## Qué se hizo con cada respuesta (fases 2-5)

| # | Respuesta | Acción |
|---|---|---|
| 1 | Compendios BPS: «Sobre todo lo que está ahí» | **Ambigua** — no delimita audiencia. NO se incorporó nada nuevo de los compendios; re-pregunta con opciones (a-d) en el archivo del 2026-08-07 (§3.13 de lineamientos: no asumir) |
| 2 | AFAM: «Se incorpora» + 7 normas | Subcategoría nueva **`asignaciones-familiares`** (NO particionada — prestación, como seguro-desempleo): 3 docs — Plan de Equidad (L 18.227 + Dec 322/008 + Dec 239/015), régimen contributivo (DL 15.084 vigente, con nota de que sus arts. 11-17 están derogados por la L 19.161), embarazo/nacimiento múltiple (L 17.474 red. L 20.365 + partes compatibles del Dec 437/002). La L 19.161 (subsidios) fue a licencias-especiales y despido, no acá |
| 3 | Decreto 86/022: «Se incorpora» | REWRITE de los 2 docs de `teletrabajo/`: contenido mínimo del acuerdo, régimen híbrido de común acuerdo, modificación permanente >45 días, registro de asistencia no invasivo, riesgos psicosociales/ergonómicos + suspensión del teletrabajo ante incumplimiento constatado, horario de desconexión en el contrato |
| 4 | Encuadre: «Sí a la subcategoría, no a la información del seguro [de oficio]» | Encuadre confirmado (registrado en `docs/dominio-consultas.md`). REWRITE del párrafo de seguro en `dimensionar-despido.ts`: la info del seguro entra SOLO ante pregunta explícita o implícita inequívoca («¿qué derechos tengo si me despiden?»); se mantienen el despido ficto como señal y el conocimiento de plazo/formularios para cuando el tema entra. +2 ítems de `fidelidad` (uno prohíbe, el otro exige la mención) |
| 5 | Doméstico: «Enviamos material» (L 18.065 + Dec 224/007) | Subcategoría nueva **`trabajo-domestico`**, **particionada** (5.º régimen especial): 3 docs — concepto/jornada/descansos/horas extras, salario/alimentación/vivienda/recibo, seguro de paro/enfermedad/salud. `despido/18-domestica.md` queda donde está (sin duplicar). `regimenes-especiales.ts` pasa de 4 a 5 regímenes; `conducta-laboral.ts` suma el filtro |
| 6 | Construcción: «Con la información general es suficiente» | Sin cambios — se mantiene `generales/10` transversal. Decisión registrada |
| 7 | Propinas: «La regla mencionada es la correcta» | Sin cambios — interpretación confirmada, el doc del 2026-08-06 queda como está |

### Corpus de la Ley 19.161 (paternidad y cuidados)

- REWRITE `licencias-especiales/03-licencia-por-paternidad.md`: la licencia del empleador (L 18.345) + la inactividad compensada del BPS (17/20/30 días según el caso, vigencias de la L 20.312), preaviso, monto, requisitos, prohibición de trabajar durante — cierra el hueco que el propio doc declaraba («cuyo detalle no está desarrollado en este material»).
- NUEVO `licencias-especiales/09-subsidio-parental-cuidados.md`: medio horario (mitad del horario, máx. 4 h/día) alternable entre padre y madre hasta los 6/9 meses, monto mitad, incompatibilidades, trámite BPS.
- NUEVO `despido/20-despido-paternidad-adopcion.md`: art. 8 bis (red. L 20.364) — no despedir hasta 30 días del reintegro, 3 sueldos + IPD, alcance a adopción y a toda ausencia de fuente legal/reglamentaria/convencional, excepciones a cargo del empleador; + suplentes sin IPD (art. 18) si el carácter se documentó antes.
- El subsidio por maternidad NO se tocó: ya está cubierto por `despido/09-subsidio-maternidad-bps.md` (mismo régimen L 19.161/L 20.000 en su versión práctica BPS — comparado, sin delta que justifique reescritura).

### Prompts

- `dimensionar-despido.ts`: párrafo de seguro reescrito (pertinencia, no de oficio) + señal nueva de despido especial: reintegro reciente de paternidad/adopción.
- `regimenes-especiales.ts`: 5.º régimen (trabajo doméstico), sin números normativos (test ampliado a los cinco).
- `conducta-laboral.ts`: bullet de regímenes especiales pasa a nombrar los cinco con la condición de filtrado del doméstico.
- `clasificacion.ts`: 2 subcategorías nuevas; señal del doméstico actualizada (ya no dice «aunque el régimen doméstico no aparezca como subcategoría»); señal nueva de AFAM («es laboral, no de familia»); descripción de licencias-especiales ampliada con paternidad BPS y medio horario.

### Evals

- `retrieval/datasets/laboral.json`: **+10 ítems** (3 AFAM, 2 licencias L 19.161, 1 despido-paternidad, 3 doméstico, 1 teletrabajo-decreto). Similitudes crudas medidas ANTES de fijar expectativas (gotcha 2026-08-06): todos los esperados rankean 1.º, piso de positivos nuevos **0.743** — cómodo sobre el umbral laboral 0.693, que NO se movió.
- `agents/laboral/datasets/fidelidad.json`: **+4 ítems** — despido sin pregunta de derechos (prohíbe mencionar el seguro de paro), «¿qué derechos tengo?» (exige mencionarlo — el ejemplo textual del equipo legal), deducción del 20 % doméstico, asignación triple por mellizos.
- `agents/recepcion/datasets/clasificacion.json`: **+2 ítems** (suspensión de AFAM → laboral; doméstica sin retiro sin descanso nocturno → laboral).

## Descartes y decisiones documentadas

- **Dec 437/002, art. 1 (definición «tres o más») y art. 4 (cese salvo 3 sobrevivientes)**: NO ingresados — contradicen la definición vigente de la L 20.365 (dos o más). El corpus sigue el texto legal; el conflicto va como pregunta 2 del archivo 2026-08-07.
- **Dec 437/002, resto**: ingresado lo compatible (carné obstétrico, retroactividad 3 meses, nivel de ingresos/tope, atención médica vinculada a IAMC/ASSE).
- **Dec 17/014 arts. 3-5 (aplicación en el tiempo 2013-2016)**: transitorios agotados, sin valor para consultas de hoy.
- **DL 15.084 arts. 19-22 (transitorios de 1980: salario familiar, colonia de vacaciones, becas)**: históricos, sin demanda posible.
- **Escala de ingresos L 16.697 arts. 26-28**: el texto no vino — el corpus refiere el concepto y el tope (15 SMN, art. 3 L 17.474) sin inventar franjas; texto pedido en la pregunta 3 del archivo 2026-08-07.
- **Laudo del grupo 21 (doméstico)**: no vino; la conducta general de convenios (deriva al abogado) lo cubre. Re-pedido como pregunta 4 (opcional).

## Verificación (fase 6)

- `pnpm corpus:sync` contra la base local: 8 docs nuevos + 3 modificados. La ingesta a producción queda para el flujo post-merge (backfill no aplica: la base ya tiene huellas).
- `pnpm test` (179 passed) y `pnpm lint` verdes; fixtures de registry/api-dominios ampliados con las 2 subcategorías.
- `pnpm evals retrieval` + `pnpm evals receptor` + `pnpm evals laboral-fidelidad` — resultados en el PR.
