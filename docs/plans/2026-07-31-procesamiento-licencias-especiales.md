# Procesamiento — Licencias especiales (guía IMPO, Leyes 18.345 y 18.458) — 2026-07-31

Lote del equipo de expertos legales, procesado con la skill `procesar-documento-legal`.
Extracción de texto con pypdf (mismo método que los lotes anteriores). Fuente en
`docs/laboral/`:

| Documento | Páginas | Tema |
|---|---|---|
| `Licencias Especiales – IMPO.pdf` | 5 | Guía "Importa que lo sepas" de IMPO sobre las licencias especiales de los trabajadores de la actividad privada (Leyes 18.345 y 18.458), actualizada a febrero de 2021 |

## Decisión de alcance

La subcategoría `licencias-especiales` ya existía en la taxonomía de Laboral como
`habilitada: false` ("Licencias por estudio, maternidad/paternidad, enfermedad."). Este
lote la **habilita** con la cobertura real del material: estudio, paternidad y adopción,
matrimonio, duelo, hijos con discapacidad y familiares a cargo con discapacidad o
enfermedad terminal. Maternidad y enfermedad **no** están desarrolladas en el documento y
quedaron fuera de la descripción (pregunta 2 del archivo de preguntas legales).

A diferencia de trabajador rural y call center, **NO es una subcategoría particionada**:
las licencias especiales aplican a todo trabajador privado dependiente, así que su corpus
convive con el régimen general (no se tocó la cláusula anti-contaminación de
`conducta-laboral`, que sigue enumerando solo rural y call center).

## Piezas y destinos

### RAG — `licencias-especiales` (7 piezas)

Curadas en `backend/corpus/laboral/licencias-especiales/*.md`, fieles a la guía. La guía
atribuye el régimen a las Leyes 18.345 y 18.458 en conjunto, **sin artículos por
licencia**: las piezas citan las leyes solo donde la guía lo hace (panorama) y no
inventan atribuciones puntuales (pregunta 4 del archivo de preguntas legales pide las
citas por artículo).

| Pieza | Contenido |
|---|---|
| `01-panorama-pago-irrenunciabilidad` | Qué licencias especiales existen (Leyes 18.345 y 18.458); con goce de sueldo, los días se cuentan como trabajados y no generan salario vacacional; 96 h/64 h del caso de familiares a cargo; irrenunciabilidad, goce efectivo, no sustituibles por salario ni descontables de la licencia ordinaria; regímenes más favorables por convenio colectivo o Consejos de Salarios |
| `02-licencia-por-estudio` | Beneficiarios (institutos habilitados por el MEC, cursos de convenios colectivos/Consejos de Salarios); 6/9/12 días anuales según horas semanales (hasta 36 / más de 36 y menos de 48 / 48); fraccionamiento hasta 3 días incluyendo el del examen; requisitos (más de 6 meses en la empresa, certificados); sanciones por no justificar o no aprobar |
| `03-licencia-por-paternidad` | Día del nacimiento y los dos siguientes (también en adopción); acreditación en 20 días hábiles o descuento como faltas sin aviso; remisión al período de inactividad compensada por paternidad SIN desarrollar su detalle (no está en el material) |
| `04-licencia-por-adopcion` | Seis semanas desde la entrega efectiva del menor (afiliados BPS, por ley/sentencia/INAU); reducción a la mitad del horario por 6 meses; uso conjunto de los primeros 10 días hábiles si ambos padres son beneficiarios; subsidio BPS como única compensación (privados; −50 % en la reducción horaria) |
| `05-hijos-con-discapacidad` | 10 días anuales con goce para controles médicos (aviso 48 h, certificado dentro de las 48 h posteriores, acreditación de la discapacidad); licencia extraordinaria sin goce de 6 meses por discapacidad severa (Down, parálisis cerebral, otras severas), adicional a la maternal/paternal, con sus requisitos |
| `06-familiares-discapacidad-enfermedad-terminal` | 96 horas anuales continuas o discontinuas para familiares a cargo (enumeración cerrada de familiares); el empleador abona hasta 64; acreditación (discapacidad / certificado del médico tratante) |
| `07-matrimonio-y-duelo` | Matrimonio: 3 días, uno coincidente con la celebración, aviso 30 días antes, acreditación en 30 días; duelo: 3 días hábiles por el fallecimiento de los familiares enumerados, acreditación en 30 días; en ambos, descuento como faltas sin aviso si no se acredita |

### Registry y taxonomía

- `laboral/clasificacion.ts`: `licencias-especiales` con `habilitada: true`, descripción
  ajustada a la cobertura real (con el deslinde "la licencia anual común y el salario
  vacacional van por rubros-laborales") + una señal nueva en Laboral (días
  pedidos/descontados por estudio, casamiento, duelo, nacimiento o cuidado de un
  familiar). Fluye solo a la skill `subcategorias-laboral`, al schema asignable y a
  `/api/dominios`.
- `docs/dominio-consultas.md`: fila Licencias especiales habilitada 2026-07-31.
- Sin skill ni rule nuevas: no es régimen particionado ni requiere heurística de
  reconocimiento propia; los requisitos y plazos viven en el corpus.

### Descartes documentados

- Artefactos de formato de la guía IMPO (URLs, encabezados "¿Sabía Ud…", fecha de
  captura): sin valor normativo.
- Menciones sin desarrollo (licencia común —ya cubierta en `rubros-laborales`—, licencia
  por antigüedad, maternidad, donación de sangre, Papanicolau/radiografía mamaria):
  quedan solo mencionadas como existentes en la pieza 01, explícitamente sin detalle, y
  pedidas al equipo legal (preguntas 2 y 3).
- El detalle del período de inactividad compensada por paternidad NO se cargó (la guía
  solo lo remite): pregunta 1 del archivo de preguntas legales.

## Auditoría del prompt ensamblado

`buildLaboralInstructions(null)` (15.276 chars): las 5 subcategorías presentes en
`<subcategorias>`; la descripción nueva deslinda la frontera con `rubros-laborales`
(licencia común/salario vacacional) sin contradecirla; la cláusula de particionado de
`conducta-laboral` sigue alcanzando solo a rural/call center; sin colisión tag↔tool.

## Evals agregadas (el gap que vino a cerrar el lote)

- **Receptor clasificación** (`clasificacion.json`, 31 → 33): días para rendir exámenes
  negados y días de duelo descontados rutean a `laboral`/`licencias-especiales`.
- **Laboral citación** (`citacion.json`, 19 → 21): días pagos para rendir exámenes y días
  por casamiento deben disparar `buscar-documentos`.
- **Laboral fidelidad** (`fidelidad.json`, 6 → 9): validan end-to-end el retrieval del
  corpus nuevo — (a) 44 h semanales + universidad → 9 días de licencia por estudio;
  (b) ofrecimiento de pagar en plata la licencia por matrimonio → la respuesta debe
  apoyarse en la irrenunciabilidad/no sustitución por salario; (c) madre a cargo con
  enfermedad terminal → 96 horas anuales y 64 a cargo del empleador.

## Ambigüedad legal → derivada al equipo (no asumida)

`docs/preguntas-legales/2026-07-31-licencias-especiales.md`:
1. **Paternidad**: la guía da 3 días (empleador) y remite al período de inactividad
   compensada por paternidad sin desarrollarlo — qué régimen informar y material.
2. **Maternidad y enfermedad**: previstas en la descripción original de la subcategoría,
   sin material — ¿se incorporan o quedan fuera?
3. **Licencias mencionadas sin desarrollo** (antigüedad, donación de sangre,
   Papanicolau/radiografía mamaria): pedido de material.
4. **Vigencia post feb-2021 y citas por artículo** de cada licencia.

Ninguna bloquea el uso del material ya cargado.

## Verificación

- `pnpm test`: 79/79 (20 archivos). Se ajustaron los tests de enumeración
  (`registry.test.ts`, `api-dominios.test.ts`) por la subcategoría nueva.
- `pnpm lint`: limpio.
- **Ingesta (DB Railway)**: las 7 piezas nuevas, todas `READY` (1 chunk c/u). Sin
  huérfanos: no hubo renombres ni movimientos de documentos existentes.
- `pnpm evals` (corrida del 2026-07-31, filtros `receptor` y `laboral`):
  - Receptor clasificación **33/33 (100 %)** — incluye los 2 items nuevos de
    licencias especiales.
  - Laboral citación **21/21 (100 %)** — incluye los 2 relatos nuevos (exámenes,
    casamiento).
  - Laboral voz-fuentes **7/7**, captación **3/3**.
  - Laboral fidelidad **9/9 (100 %)** — los 3 items end-to-end del corpus nuevo pasan
    (9 días de estudio con 44 h; irrenunciabilidad del pago en plata del matrimonio;
    96/64 horas por familiar con enfermedad terminal).
