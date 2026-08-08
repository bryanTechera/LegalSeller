# Procesamiento de las respuestas sobre AFAM y convenio doméstico (2026-08-07)

Segunda vuelta del mismo día. Material recibido: las **respuestas del equipo legal** a las 4 preguntas de `docs/preguntas-legales/2026-08-07-complemento-anexo-laboral.md` (ahora RESPONDIDA) y **5 documentos nuevos** en `docs/laboral/`: Ley 16.697, páginas del BPS «Asignación familiar» y «Plan de equidad», acta del Consejo de Salarios del Grupo 21 (6/7/2026) y página del MTSS sobre trabajo doméstico. Skill `procesar-documento-legal`. Preguntas abiertas: `docs/preguntas-legales/2026-08-07-montos-y-convenio-domestico.md`.

## Lectura (fase 1)

Leídos completos los 5 documentos. El acta del Grupo 21 **vino escaneada, sin capa de texto**: se rasterizó a 170 dpi y se leyó como imagen (3 folios). Es el único documento del corpus que llegó así — si vuelve a pasar, el camino es `fitz` → PNG → lectura visual, no `get_text()`, que devuelve 2 caracteres y parecería un PDF vacío.

## Qué se hizo con cada respuesta (fases 2-5)

| # | Respuesta | Acción |
|---|---|---|
| 1 | Compendios BPS: «Dejemos solo a)» | **Frontera cerrada**: el asistente atiende solo al trabajador. Monotributo, unipersonales, jubilaciones y obligaciones del empleador quedan fuera del universo. No se incorporó nada nuevo de los compendios; la frontera pasó a estar **medida** con 2 ítems de receptor (jubilación y monotributo → `fuera-de-universo`) |
| 2 | Embarazo múltiple: «debe primar la ley de 2024» | Confirmado lo implementado. `03-embarazo-nacimiento-multiple.md` dice ahora en forma expresa que basta con dos hijos y que la exigencia de tres o más del Decreto 437/002 quedó desplazada por la ley posterior. El sub-caso del fallecimiento sigue sin afirmarse (repreguntado) |
| 3 | Escala: «Se pasa material de BPS» | REWRITE de `02-regimen-contributivo.md`: escala completa de los arts. 26-28 de la Ley 16.697 (dos franjas, tope de 10 SMN, incremento del tope por beneficiario adicional, cómputo de ingresos de **ambos cónyuges o del concubino conviviente**) + importes vigentes del BPS + pago bimestral + nómina completa de atributarios + asignación doble por discapacidad y ayudas extraordinarias. REWRITE de `01-plan-de-equidad.md`: montos mensuales vigentes, precisión de la extensión hasta los 16 años (enfermedad o zona rural a más de 5 km), pago desde la solicitud con retroactividad hasta la reserva de agenda, y la distinción discapacidad con/sin pensión de invalidez |
| 4 | Grupo 21: «Se adjunta último Consejo de Salarios y reajuste» | 2 docs nuevos en `trabajo-domestico/`: `04-categorias-y-salarios.md` (las tres categorías vigentes desde el 1/7/2026 con su criterio de encuadre por tarea principal, mínimos mensuales y por hora de los dos semestres, franjas de ajuste y correctivo) y `05-beneficios-y-licencias-del-convenio.md` (licencia anual de 20 días y salario vacacional complementario, presentismo, prima por antigüedad, 8 licencias especiales del sector, lactancia, feriado del 19 de agosto, ropa y útiles, fondo social). Ampliados `02` (plazos de pago del sueldo, ropa y útiles, copia del recibo, remisión a las categorías) y `03` (inscripción en BPS y sus plazos) |

### Prompts

- `regimenes-especiales.ts`: el bullet de trabajo doméstico señala que es **el único régimen cuyo Consejo de Salarios está en el material** —con categorías por tarea principal y beneficios de convenio— y suma «qué tarea hace principalmente» a lo que hay que relevar, porque de eso depende su categoría y su mínimo. Sin números (el test que los prohíbe sigue verde).
- `clasificacion.ts`: descripciones de `trabajo-domestico` (categorías y beneficios de convenio) y `asignaciones-familiares` (topes de ingresos y asignación doble por discapacidad).
- La rule `conducta-laboral` **no se tocó**: su regla de convenios ya está condicionada a «solo existen para tu respuesta si la búsqueda los devolvió», así que el laudo del Grupo 21 entra por la puerta correcta sin excepción nueva.

### Evals

- `retrieval/datasets/laboral.json`: **+8 ítems** (3 AFAM: monto por hijo, tope de ingresos, discapacidad; 5 doméstico: valor hora por categoría, encuadre de categoría, presentismo, licencia anual, plazo de pago del sueldo). Similitudes crudas medidas antes de fijar expectativas: todos rankean 1.º, piso **0.733**. El umbral laboral **0.693 no se movió**.
- `agents/laboral/datasets/fidelidad.json`: **+2 ítems** — importe de la asignación familiar por hijo y mínimo por hora de la categoría Cuidados. Miden que el agente dé el importe publicado y no una cifra derivada de multiplicar el salario mínimo general (ver descarte de abajo).
- `agents/recepcion/datasets/clasificacion.json`: **+2 ítems** de frontera — consulta previsional y consulta de monotributo → `fuera-de-universo`, que es exactamente lo que la respuesta 1 acaba de decidir.

## Descartes y decisiones documentadas

- **Ley 16.697 salvo arts. 26-28**: es una ley de ajuste fiscal (IVA, IMESI, impuesto a las retribuciones personales, régimen de vehículos del Estado). Solo los arts. 26 a 28 tratan asignaciones familiares; el resto no toca consultas de trabajadores.
- **Los porcentajes del art. 26 (16 % y 8 %) NO se presentan como fórmula de cálculo.** Cruzados con los importes vigentes del BPS, el valor de referencia que resulta ronda los $ 8.450 y no el salario mínimo nacional general: un consultante que multiplique el 16 % por el salario mínimo vigente obtiene una cifra muy superior a la real. El corpus da la estructura (franjas, tope, incremento) y los importes publicados, sin invitar a calcular. Lectura preguntada al equipo legal (pregunta 1 del archivo nuevo).
- **Valores del MTSS al 30/6/2026** (Cocina $ 32.875, Cuidados $ 33.935): no se ingresaron para no convivir con los vigentes. No hay contradicción con el acta — son los importes **previos** al ajuste del 1/7/2026, y verifican con los porcentajes de ajuste (2,8 % sobre $ 32.875 da los $ 33.796 del acta).
- **Licencia por antigüedad del sector doméstico**: el convenio fija 20 días y no menciona el día adicional cada cinco años del régimen general. No se afirma ni una cosa ni la otra; preguntado (pregunta 4).
- **Datos de contacto del MTSS** (teléfonos, 0800, formulario web): el agente no deriva a terceros — su salida es el abogado de la red.

## Nota operativa: el corpus ahora tiene importes con fecha

Es la primera vez que el corpus laboral lleva **cifras que vencen**: los importes de asignaciones familiares rigen desde enero de 2026 y se ajustan por IPC, y los mínimos del Grupo 21 tienen vigencia semestral (el acta ya trae los del semestre enero-junio 2027). Cada documento dice desde cuándo rige lo que informa, pero eso no los actualiza solo: los momentos previsibles de revisión son **enero** (asignaciones familiares y Grupo 21) y **julio** (Grupo 21). Si el equipo legal prefiere que el asistente remita al BPS en vez de dar la cifra, la decisión está preguntada (pregunta 2 del archivo nuevo) y el cambio sería acotado a estos cuatro documentos.

## Verificación (fase 6)

- `pnpm corpus:sync` contra la base local: 4 modificados + 2 nuevos + 1 modificado de AFAM (7 documentos tocados en total).
- `pnpm test` (179 passed) y `pnpm lint` verdes.
- `pnpm evals retrieval`: recall@5 = 1.000 y vacío-correcto = 1.000 en las cinco categorías (laboral con 45 positivos). `pnpm evals laboral-fidelidad` y `pnpm evals receptor`: resultados en el PR.
