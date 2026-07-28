# Revisión de feedback legal — sesiones de Federico — 2026-07-28

Ciclo de la skill `revisar-feedback-legal` sobre cinco sesiones de `/revision` que
dejó Federico (equipo de expertos legales). `pnpm feedback:pull` trajo 8 notas
abiertas: **6 accionables de Federico + 2 de prueba** (`test`/`test`, autor Bryan-1 —
ruido de dev, se descartan).

## Diagnóstico (open coding del primer fallo upstream) y triage

Dos ejes: integridad legal (crítico) y voz/venta (calibración de producto).

| Nota | Sesión | Primer fallo upstream | Destino |
|---|---|---|---|
| cmry5saxc | Popurrí (rural) | **Fabricó la Ley 10.809 como vigente** (derogada ~50 años) al insistirle el consultante "¿cuál es la norma?". `buscar-documentos` no trajo ese número — lo completó del prior de entrenamiento. Peor vector de drift. | `conducta-laboral` (gatillo "pedido de norma") + eval fidelidad `prohibido:["10.809"]` |
| cmry5dnmq | Popurrí (rural) | **Expuso el título del documento interno** ("Despido — Trabajador rural y trabajadora doméstica"). Viola la regla crítica de no nombrar fuentes. | `conducta-laboral` (ejemplo contrastivo) + eval voz-fuentes anti-regresión |
| cms0gbwea | Familia (pensión) | **Introdujo el tema de las visitas sin que se consultara.** La regla safety "pensión≠visitas" se disparó como mandato de mencionarla siempre. | `conducta-familia` (acotar scope + "responder lo consultado") + eval `prohibido:["visita"]` |
| cms0gekr8 | Familia (pensión) | **Pregunta de continuación + pedido de contacto en el mismo turno** (incoherente). | `captacion-caso` (variante sin-pedido) |
| cmry6l1pj | Familia (perro) | **Afirmó jurisprudencia inexistente** ("familia multiespecie", "estrategia usada en tribunales") extrapolando corpus de tenencia de niños; y se explayó sin reservar valor. | `conducta-familia` (anti-extrapolación) + eval honestidad |
| cms1wc341 | Laboral (prescripción) | Por /revision contestó **bien**; por el sitio salió incompleta ("faltó cualquier gestión judicial"). Corpus trae el art. 4 completo. | Informativa: variabilidad de síntesis a `temperature:1`, mismo backend. Sin cambio de prompt (evita sobre-ajuste) ni eval (la corrida revisada fue correcta). |

Nota: la nota cmry5saxc **confirma** el marco normativo rural que ya se cargó el
2026-07-28 (Decreto-Ley 14.785 + Decreto 216/012 + Ley 18.441), por lo que el gap de
retrieval de la nota 6 ya estaba cerrado antes de este ciclo; lo que faltaba era
blindar el comportamiento (no fabricar el número bajo presión).

## Fixes implementados

### Prompt
- **`laboral/rules/conducta-laboral.ts`**: bullet nuevo para el gatillo "el consultante
  pide la norma exacta" (citar solo lo que la búsqueda devolvió; si no trae número, no
  completarlo de memoria — riesgo: norma derogada). Ejemplo contrastivo con el caso
  rural que cubre ambas notas (MAL: citar Ley 10.809 derogada / MAL: nombrar el material
  interno / BIEN: citar lo recuperado o remitir al abogado).
- **`familia/rules/conducta-familia.ts`**: (a) anti-extrapolación — si la búsqueda trae
  un instituto que no es el del consultante (tenencia de hijos ante una consulta por una
  mascota), no extenderlo por analogía ni presentar como estrategia consolidada lo que el
  texto no dice; (b) "responder lo consultado, sin abrir temas colaterales"; (c) la regla
  "pensión≠visitas" quedó **condicional** — solo cuando el consultante plantea usar una
  obligación para presionar la otra.
- **`comunes/rules/captacion-caso.ts`** (variante sin-pedido): si el mensaje cierra con
  una pregunta de continuación, no pedir el contacto en ese turno.

Auditado el prompt **ensamblado** de laboral y familia: sin contradicciones con las
rules vecinas ni con `<captacion>`.

### Evals anti-regresión
- Scorer `voz-fuentes` (`run-evals.ts`): soporta ahora `contieneAlguno` y `prohibido`
  (además de `contiene` y `sinReferenciasInternas`).
- `laboral/voz-fuentes.json` +1 (nota 5): peón rural pidiendo la fuente exacta →
  `sinReferenciasInternas` (el scorer ya detecta la filtración de títulos `X —`).
- `laboral/fidelidad.json` +1 (nota 6): trabajador rural pidiendo el número de ley →
  `prohibido:["10.809","10809"]`.
- `familia/voz-fuentes.json`: nota 2 (no pago de pensión) → `prohibido:["visita"]`;
  nota 4 (perro/analogía CNA) → `contieneAlguno` de fórmulas de honestidad ("no hay",
  "no existe", "no contempla", "bien(es)"…).

## Verificación

- `pnpm test`: 71/71 (19 archivos). `pnpm lint`: limpio.
- `pnpm evals` (contra DB Railway, corpus ingestado):
  - **Laboral voz-fuentes 7/7 (100%)** — el item nuevo (peón rural pidiendo la fuente,
    nota 5) pasa; el scorer detecta la filtración de títulos.
  - **Laboral fidelidad**: el item nuevo (rural pidiendo el número de ley, nota 6) pasó
    en **3/3 corridas** (nunca cita la 10.809). La **suite** queda por debajo de 0.9 solo
    por los dos items trace-derived **pre-existentes** (guardia/nocturnidad "desde la
    primera hora" y BSE "triple"), que oscilan a `temperature:1` — misma flakiness
    registrada en `2026-07-28-procesamiento-rural-call-center.md`, no regresión de este
    ciclo.
  - **Familia voz-fuentes**: con el fix inicial la nota 2 (no pago de pensión →
    `prohibido:["visita"]`) oscilaba ~50% (2 pass / 2 fail en 4 corridas). Se **reforzó**
    `conducta-familia` con un ejemplo contrastivo y quedó **4/4 en 4 corridas seguidas**.
    La nota 4 (perro/analogía, `contieneAlguno` de honestidad) pasó en todas.
  - **Laboral captación 3/3**, **Familia captación 2/2** — el cambio en `captacion-caso`
    (nota 3) no regresiona la variante pedido-hecho.

## Respuestas al equipo legal

Las 6 notas de Federico se respondieron vía `pnpm feedback:respond` (voz para
abogados), dejándolas **RESPONDIDA** (no resueltas) porque las notas 2, 5 y 6 invitan a
re-probar el escenario. Las 2 notas de prueba de Bryan-1 se dejaron sin tocar.
