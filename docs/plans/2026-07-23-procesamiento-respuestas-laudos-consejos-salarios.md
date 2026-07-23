# Procesamiento — respuestas del equipo legal sobre laudos de Consejos de Salarios (2026-07-23)

Procesamiento (skill `procesar-documento-legal`) de las respuestas del equipo
legal al archivo enviable
`docs/preguntas-legales/2026-07-23-laudos-consejos-salarios.md` (originado en la
review `2026-07-23-review-sesion-probando-fallos-anteriores.md`, hallazgo 2:
fabricación de beneficio sectorial).

## Piezas y destinos

| Pieza | Contenido | Destino | Acción |
|---|---|---|---|
| 1 | "En esta etapa nos concentramos en la opción (b)": el sistema nunca afirma contenido sectorial de laudos/convenios; responde la regla legal general, menciona que el convenio puede mejorar y deriva la verificación al abogado | rule (ya existente) | DISCARD como contenido nuevo — la directiva de laudos + par contrastivo ya estaban en `conducta-laboral` desde el fix de la review, gateados por `laboral-fidelidad`. La decisión pasa de provisoria (tomada por el equipo técnico ante el hallazgo) a **ratificada por el equipo legal**. No se ingesta material de laudos ni se habilita nada nuevo. |
| 2 | "El sistema debe señalar el régimen general al que tenemos acceso, sin perjuicio de que el consejo de salarios pueda contener una solución **distinta o más beneficiosa**" | rule | DISCARD tras refutación empírica. Se intentó adoptar la fórmula del experto en la directiva y el ejemplo BIEN de `conducta-laboral` ("puede prever una solución distinta o más beneficiosa" en lugar de "condiciones mejores"); `laboral-fidelidad` falló 2 corridas consecutivas (el wording invita al modelo a ejemplificar en qué consistiría esa solución — el dump mostró "se pague desde la primera hora o con un porcentaje mayor… el sector de la seguridad privada suele tener regulaciones muy específicas", la misma fabricación del hallazgo original). Se revirtió al wording eval-estable; la ratificación aplica al comportamiento, no a una letra obligatoria, y la fórmula del experto queda documentada en el archivo de preguntas. |

Sin descartes por irrelevancia ni preguntas legales nuevas — las respuestas son
inequívocas.

## Evals

La mitad ratificada de la respuesta correcta (mencionar que el convenio del
sector puede prever otra solución) no estaba medida: el ítem del guardia en
`backend/src/test/agents/laboral/datasets/fidelidad.json` solo exigía la
condición de horas consecutivas y prohibía la fabricación sectorial. Se agregó
el check `contieneAlguno: ["convenio", "laudo", "consejo de salarios"]`
(al menos uno debe aparecer — mismo hecho, varias formulaciones válidas), con
soporte nuevo en el matcher de `evalFidelidad` (`run-evals.ts`).

Gate: `pnpm evals fidelidad` en verde en 2 corridas consecutivas (tras el cierre
del loophole, ver abajo), además de `pnpm test` y `pnpm lint`.

## Hallazgo colateral: el gate de fidelidad de main era inestable

Al correr el gate durante este procesamiento, el ítem del guardia falló en 4
corridas consecutivas — incluso con la rule byte-idéntica a la de `main`
(2/2 en dos corridas al verificarse el fix original: muestreo insuficiente a
`temperature: 1`, no estabilidad real). El dump de la corrida (sonda con
chunks) mostró el mecanismo: la búsqueda devuelve solo la ley 19.313/decreto
(el corpus está bien, e incluye el único caveat legítimo — "los Consejos de
Salarios podrán fijar porcentajes mayores"), pero el modelo esquiva la
directiva con una **generalización de rubro**: "es muy común que en el sector
de la seguridad privada existan acuerdos que podrían reconocer la nocturnidad
desde la primera hora". No nombra el grupo ni afirma qué dice *ese* convenio
(lo único que el par contrastivo etiquetaba como MAL) — generaliza, que es la
fabricación original del hallazgo de la review con hedge.

**Fix**: la directiva de laudos en `conducta-laboral` ahora cubre
explícitamente las generalizaciones de rubro ("es común que en tu sector…",
"en muchos casos se reconoce…") como contenido sectorial sin respaldo, y el
ejemplo contrastivo suma un segundo MAL con esa forma cubierta. Validado con
2 corridas verdes consecutivas de `pnpm evals fidelidad`.

## Implicación operativa

El modo (b) queda como política vigente: no se pide ni se espera material de
laudos por sector en esta etapa. Si más adelante el equipo legal decide avanzar
al modo (a), ese material entra por `procesar-documento-legal` como corpus
citable con vigencia declarada.
