# Procesamiento de la BPC y el compendio de prestaciones del BPS (2026-08-08)

Material recibido: las **respuestas del equipo legal** a `docs/preguntas-legales/2026-08-07-montos-y-convenio-domestico.md` (3 de 4 contestadas) y **3 documentos nuevos** en `docs/laboral/`: la Ley 17.856 (creación de la BPC), el compendio «Prestaciones» del BPS (edición 2026, 76 páginas) y la página «Valores actuales» del BPS. Skill `procesar-documento-legal`. Preguntas abiertas: `docs/preguntas-legales/2026-08-08-topes-bps-y-licencia-domestica.md`.

## Lectura (fase 1)

Leídos completos los 3 documentos. El compendio del BPS es el más extenso que entró al proceso hasta ahora y cubre mucho más que lo consultado: prestaciones de actividad (desempleo, maternidad, paternidad, cuidados parentales, enfermedad, mutual, asignaciones familiares, prótesis y lentes), de pasividad (jubilaciones y pensiones) y sociales.

## Qué se hizo con cada respuesta (fases 2-5)

| # | Respuesta | Acción |
|---|---|---|
| 1 | La Ley 17.856 sustituyó por la BPC toda referencia al salario mínimo nacional; el BPS parametriza la escala en 7,4012 / 0,1963 y 12,3380 / 0,0982 BPC | **Lectura confirmada y con fundamento.** Documento nuevo `generales/11-base-de-prestaciones-y-contribuciones.md` (qué es, el artículo 1 de la Ley 17.856, cómo se ajusta, valor vigente, y la advertencia de que BPC ≠ salario mínimo nacional: $ 6.864 contra $ 25.383). REWRITE de la escala de `02-regimen-contributivo.md`, ahora en BPC, sin presentar los porcentajes del artículo 26 como fórmula de cálculo |
| 2 | «Sigue dando el importe, lo actualizaremos cuando corresponda» | Criterio confirmado, sin cambio de corpus. Los momentos previsibles de actualización pasan a ser **enero** (BPC, asignaciones familiares y Grupo 21) y **julio** (Grupo 21) |
| 3 | Cese salvo que sobrevivan por lo menos **dos** hijos | Sección nueva en `03-embarazo-nacimiento-multiple.md`, con el caso resuelto en los dos sentidos: mellizos con un fallecimiento → cesa el régimen especial; trillizos con un fallecimiento → se mantiene. La cita que dieron dice «dos» donde el decreto que nos habían enviado dice «tres»: se aplicó el criterio que indicaron y se repreguntó de dónde sale esa redacción (pregunta 3 del archivo nuevo) |
| 4 | **Sin responder** | El asistente sigue dando los 20 días del convenio sin pronunciarse sobre la antigüedad. Repreguntado |

## Lo que abrió el compendio

- `seguro-desempleo/02`: la regla legal única (180 días / 150 jornales / 6 BPC en 12 meses) convive con un detalle operativo por sector que el texto legal no distingue — el **rural** usa la ventana de 30 meses y el **servicio doméstico** admite una alternativa de 24 meses. Los dos son subcategorías habilitadas, así que la tabla entró.
- `licencias-especiales/03`: se agregó la síntesis que faltaba —**20 días corridos en total**, 3 del empleador más 17 del BPS— porque es la cuenta que hace quien pregunta, y la Ley 20.377 (licencia por nacimiento sin vida de más de 20 semanas o más de 500 g).
- `licencias-especiales/10-subsidio-por-enfermedad.md`, documento nuevo: el corpus tenía la protección del puesto del trabajador enfermo (`despido/11`) pero nada sobre **qué se cobra**. Cubre requisitos por forma de remuneración, el pago desde el cuarto día (primero si hay internación), el 70 % con tope de 9,8709 BPC, el plazo de un año prorrogable, el accidente de trabajo (BSE 66,67 % + BPS 3,33 %) y que la ausencia certificada genera licencia, salario vacacional y antigüedad por el Convenio 132 de la OIT. No duplica `despido/11`: lo remite.
- `clasificacion.ts`: la descripción de `licencias-especiales` incorpora el subsidio por enfermedad, que sin eso no tenía filtro por donde entrar.
- `dimensionar-rubros.ts`: heurística nueva — las prestaciones del BPS vienen en BPC y hay que decir el equivalente en pesos, con la advertencia de que las normas viejas hablan de salarios mínimos nacionales y calcular sobre el salario mínimo actual da una cifra muy por encima de la real. Sin números (siguen prohibidos en prompts).

## Hallazgo: la cifra de la norma no es la que paga el BPS

Al llevar el criterio de la BPC al seguro de paro apareció una divergencia sistemática. El artículo 7.8 del Decreto-Ley 15.180 y el artículo 21 del Decreto 162/009 fijan los máximos en 11 / 9,5 / 8 / 7 / 6,5 / 6 BPC; el compendio del BPS informa 13,5715 / 11,7199 / 9,8709 / 8,6374 / 8,0193 / 7,4012. **Cada valor del BPS es el de la norma multiplicado por ~1,2338**, y el mismo factor aparece en asignaciones familiares (16 % → 0,1963 BPC; 6 y 10 SMN → 7,4012 y 12,3380 BPC; 15 SMN → 18,5056 BPC).

No hay en el material la norma que produce esa diferencia, y no es menor: en el primer mes de seguro de paro son unos $ 75.500 contra unos $ 93.100. El corpus informa **los valores que aplica el BPS** —son los que la persona va a cobrar— y deja dicho cuáles son los nominales de la norma. Preguntado (pregunta 1 del archivo nuevo).

Corolario para el próximo documento del BPS: **una cifra tomada del texto legal no es verificación suficiente de lo que se paga.** Hasta ahora el corpus se validaba contra la norma; acá la norma estaba bien transcrita y aun así el número era el equivocado para responder «cuánto cobro».

## Descartes y decisiones documentadas

- **Compendio, prestaciones de pasividad** (páginas 44 a 65: jubilaciones, pensiones por sobrevivencia, pensión vejez, asistencia a la vejez): fuera del universo por la respuesta «Dejemos solo a)» del 7 de agosto. Incluye la pensión para hijos de personas fallecidas por violencia doméstica (Ley 18.850), que toca un tema con tratamiento diferencial en Familia — se deja anotado, no se ingresa por la puerta laboral.
- **Compendio, prestaciones de salud y sociales** (páginas 66 a 76: Crenadecer, leche materna, órdenes de asistencia, ayudas extraordinarias, vivienda, turismo social) y **prótesis y lentes**: no son consultas de conflicto laboral.
- **Compendio, afiliaciones mutuales y SNIS** (páginas 28 a 32): cobertura de salud, no reclamo laboral. El único dato de frontera —13 jornales o 1,25 BPC al mes para generar mutual— no justifica abrir el tema.
- **Compendio, marco conceptual de la seguridad social** (páginas 7 y 8): teoría general que el modelo ya tiene.
- **«Valores actuales» del BPS**: se tomaron la BPC y el salario mínimo nacional, que son los que hacen falta para leer las prestaciones. La BFC, la cuota mutual, el CPE, los topes de los artículos 7 y 8 de la Ley 16.713, los niveles del artículo 22 de la Ley 20.130, la UR, el recargo por mora, el dólar de convenios, los timbres y la UI son parámetros de aportación patronal y previsionales.
- **Ley 17.856, artículo 4** (vigencia): sin valor para una consulta.
- **Maternidad**: el compendio no agrega nada sobre lo que ya tiene `despido/09-subsidio-maternidad-bps.md`, que es más detallado. No se tocó.
- **El tope de la primera franja de asignación familiar** no reconcilia: el BPS publica $ 50.502 y 7,4012 BPC dan $ 50.802, mientras las otras tres cifras cierran exactas. Se mantiene el importe publicado y se preguntó (pregunta 2).

## Verificación (fase 6)

- `pnpm corpus:sync` contra la base local: 2 documentos nuevos y 5 modificados. Verificado además byte a byte que el `contentHash` de los 7 coincide con el sha256 del archivo en disco — el corpus local no quedó stale.
- `pnpm test` y `pnpm lint`: verdes.
- `pnpm evals retrieval`: recall@5 = 1.000 y vacío-correcto = 1.000 en las cinco categorías (laboral con 52 positivos). **+7 ítems** (BPC, subsidio por enfermedad ×3 —uno de ellos el efecto del Convenio 132 sobre la licencia—, fallecimiento en nacimiento múltiple, seguro de paro del sector doméstico, tope del seguro de paro).
- `pnpm evals laboral-fidelidad`: 18/18. **+3 ítems** — tope del primer mes de seguro de paro, valor de la BPC y desde qué día paga el subsidio por enfermedad.
- `pnpm evals receptor`: 57/60 (95 %), con los tres fallos preexistentes ajenos a este cambio.

### El umbral laboral, otra vez

Se remidieron los **10 ítems del golden set que ya apuntaban a documentos modificados**, no solo los nuevos — que es el error de la vuelta pasada. El piso de positivos quedó en **0.700**, igual que antes de este cambio: ninguna reescritura movió un ítem existente hacia abajo. El margen sobre el umbral de 0.693 sigue siendo de +0,007 en vez de los ±0,010 de la calibración original. **El umbral no se movió**: la recalibración a ~0,691 es una decisión abierta, y se dejó una nota en `buscar-documentos-tool.ts` para que el comentario de calibración no siga diciendo un número que ya no es el real.
