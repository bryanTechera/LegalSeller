# Dominio de consultas — taxonomía y roadmap de categorías

> Fuente de verdad del universo de consultas que atiende LegalSeller. Esta taxonomía
> **determina la arquitectura de agentes**: cuántos agentes principales y sub-agentes
> existen, cómo se cablean y cómo se dividen las responsabilidades. Cualquier cambio
> acá impacta directamente en `docs/guia-arquitectura.md` §2.
>
> Registrada el 2026-07-19 a partir del diagrama de categorías definido por el equipo.
> El propósito de atender estas consultas (funnel de captación de casos) está en
> `docs/vision-producto.md`.

## 1. Universo completo de consultas

El sistema completo atiende **5 categorías habilitadas** (áreas del derecho), cada una
con sus subcategorías (tipos de consulta), más **1 categoría declarada aún no
habilitada** (Civil). Delante de todas hay un **router** que recibe la
consulta del usuario y la dirige a la categoría correspondiente. (El universo
original era de 4 categorías; **Tránsito** se sumó el 2026-07-31 con el material
normativo enviado por el equipo legal; **Civil** se declaró el 2026-08-03 a partir
del Q&A del Código Civil, sin habilitar.)

```
                          Usuario
                             │
                        ┌────▼────┐
                        │ ROUTER  │
                        └────┬────┘
      ┌──────────────┬───────┼──────────────┬───────────────────┐
      ▼              ▼       ▼              ▼                   ▼
   LABORAL        FAMILIA  TRÁNSITO   ARRENDAMIENTO       RELACIONES DE
                                       Y DESALOJO           CONSUMO

   (declarada, aún sin habilitar: CIVIL)
```

### Laboral
| Subcategoría | Estado |
|---|---|
| **Despido** | ✅ **v1 — punto de partida** |
| **Rubros laborales** | ✅ **habilitada 2026-07-19** (material del equipo legal: jornada/horas extras, descansos/licencia/salario vacacional/aguinaldo, salario, trabajo nocturno) |
| **Trabajador rural** | ✅ **habilitada 2026-07-28** (régimen especial: Decreto-Ley 14.785 + Decreto 216/012 — salario, vivienda/alimentación, jornada, licencia, feriados, seguridad y despido rural). Subcategoría **particionada**: su corpus no contamina el régimen general (rule `conducta-laboral`) |
| **Call center** | ✅ **habilitada 2026-07-28** (régimen especial de operadores de centros de atención telefónica: Decreto 147/012 — jornada 39 h semanales, pausas, ambiente/ergonomía, escucha de auditoría). Subcategoría particionada |
| **Licencias especiales** | ✅ **habilitada 2026-07-31** (guía IMPO sobre Leyes 18.345 y 18.458: estudio, paternidad y adopción, matrimonio, duelo, hijos con discapacidad, familiares a cargo con discapacidad o enfermedad terminal). Subcategoría NO particionada (aplica a todo trabajador privado). Maternidad y licencia por enfermedad quedan fuera (pregunta legal 2026-07-31 pendiente) |
| Accidentes laborales | Pendiente |

### Familia
| Subcategoría | Estado |
|---|---|
| Pensión alimenticia, tenencia y visitas | ✅ **habilitada 2026-07-22** (síntesis de derecho de familia + CNA consolidado) |
| Divorcio, sociedad conyugal | ✅ **habilitada 2026-07-22** (incluye el divorcio por sola voluntad vigente desde 2026) |
| Sucesiones | ✅ **habilitada 2026-07-22** — corpus mínimo (mapa del proceso); material profundo pedido al equipo legal |
| Unión concubinaria | ✅ **habilitada 2026-07-22** (base: síntesis; texto de la Ley 18.246 pedido al equipo legal) |
| Violencia de género | ✅ **habilitada 2026-07-22** con tratamiento diferencial (ver §4) |

Temas de familia **sin subcategoría propia** (adopción, filiación y partidas, identidad de género/cambio registral, capacidad y curatela, viajes de menores): cubiertos por **corpus transversal a nivel categoría** (`Document.subcategoria = NULL`); el caso se registra sin subcategoría, con los hechos en el brief. Ver `docs/plans/2026-07-22-procesamiento-familia.md`.

### Tránsito

| Subcategoría | Estado |
|---|---|
| *(sin subcategorías en v1)* | ✅ **Categoría habilitada 2026-07-31** (Ley 18.191 de tránsito y seguridad vial, Ley 19.824, Ley 18.412 SOA + Decretos 381/009, 361/010 y 285/016, Ley 19.678 de contrato de seguro — selección —, Reglamento Nacional de Circulación Vial). Corpus entero a **nivel categoría** (`Document.subcategoria = NULL`); los hechos del caso van al brief. Partición en subcategorías (siniestros/SOA · infracciones y licencia · seguros del vehículo) **propuesta al equipo legal** en `docs/preguntas-legales/2026-07-31-transito.md` |

Cobertura de la categoría: siniestros con lesiones y reclamo al seguro obligatorio (SOA, incluidas coberturas especiales por vehículo no identificado/sin seguro/hurtado), infracciones, multas y permiso por puntos, alcoholemia y controles, licencia de conducir, y la relación con la aseguradora del vehículo (Ley 19.678). Fuera del material: la vía penal del siniestro (lesiones/homicidio culposo), la responsabilidad civil por daños materiales entre particulares y el detalle reglamentario del permiso por puntos (Decreto 181/025, pedido al equipo legal). Ver `docs/plans/2026-07-31-procesamiento-transito.md`.

### Arrendamiento y desalojo
| Subcategoría | Estado |
|---|---|
| Contrato de alquiler | ✅ **habilitada 2026-07-31** (síntesis de arrendamientos urbanos y desalojo del equipo legal) |
| Desalojo ley 8153 | ✅ **habilitada 2026-07-31** (libre contratación: vencimiento 6 meses/1 año; incluye destinos no habitacionales en libre contratación desde 2026 por Ley 20.446) |
| Desalojo ley 14219 | ✅ **habilitada 2026-07-31** (estatuto: buen/mal pagador, temporada, comodato/precario, vivienda de empleo, ex concubino, finca ruinosa) |
| Desalojo ley 19889 | ✅ **habilitada 2026-07-31** (régimen sin garantía: art. 421, plazos abreviados, clausura +60%, prórrogas 7/5). El diagrama original decía "ley 19980" — el equipo legal **confirmó el 2026-08-03** que era un error de tipeo y la ley correcta es la **19.889** (`docs/preguntas-legales/2026-07-31-arrendamientos.md`, RESPONDIDA) |
| Cobro alquileres | ✅ **habilitada 2026-07-31** (proceso ejecutivo, acumulación con el desalojo, deuda tras la entrega) |
| Arrendamiento rural | ✅ **habilitada 2026-08-03** (texto consolidado del Decreto-Ley 14.384 enviado por el equipo legal: ámbito y exclusiones, contrato escrito e inscripción, desalojo y entrega del predio, mora y cobro, precio, mejoras y aparcería). No estaba en la taxonomía original — encuadre como subcategoría propia con confirmación pedida en `docs/preguntas-legales/2026-08-03-arrendamientos-rurales.md`, junto con el vacío de plazos contractuales (arts. 11-18 derogados por Ley 16.223, cuyo texto no tenemos). El desalojo del trabajador rural despedido sigue en Laboral (reparto confirmado, pregunta 5 del archivo de 2026-07-31) |

El conocimiento que aplica a toda la categoría (mapa de regímenes y encuadre, tenencia/comodato/precario, estructura general del proceso de desalojo, lanzamiento y prórrogas, controles tributarios) vive como **corpus transversal** (`Document.subcategoria = NULL`). El agente **no** tiene versión especialista de `caso-sensible` (el material no define protocolo diferencial); la urgencia procesal (notificación judicial, lanzamiento) se maneja en la rule `conducta-arrendamiento` y la skill `dimensionar-arrendamiento`. Ver `docs/plans/2026-07-31-procesamiento-arrendamientos.md` y `docs/plans/2026-08-03-procesamiento-arrendamientos-rurales.md`. Las respuestas del 2026-08-03 confirmaron además la frase institucional Jurco de la categoría, el texto del art. 51 del DL 14.219 (clausura 40%, vs 60% de la Ley 19.889) y las fronteras: ex concubino **por el fin de la consulta** (recuperar la vivienda → arrendamientos; disolución/hijos/violencia → familia) y vivienda por empleo urbano → arrendamientos.

### Relaciones de consumo
| Subcategoría | Estado |
|---|---|
| Derechos del consumidor | ✅ **habilitada 2026-07-31** (Ley 17.250 consolidada + Decreto 244/000: información y precios, retracto en compras a distancia, prácticas y cláusulas abusivas, garantía, publicidad, incumplimiento y opciones del consumidor, responsabilidad, presupuesto, salud y seguridad) |
| Procedimiento ante MEF y poder judicial | ✅ **habilitada 2026-07-31** (vía administrativa ante el Área Defensa del Consumidor —audiencia de conciliación y trámite en línea del MEF—, infracciones y sanciones, y proceso judicial de pequeñas causas de la Ley 18.507) |

Los conceptos que atraviesan ambas subcategorías (relación de consumo y su prueba, derechos básicos, plazos de caducidad y prescripción) van como **corpus transversal a nivel categoría** (`Document.subcategoria = NULL`). Ver `docs/plans/2026-07-31-procesamiento-relaciones-consumo.md`.

### Civil

| Subcategoría | Estado |
|---|---|
| *(partición pendiente del equipo legal)* | ⏳ **Declarada 2026-08-03, NO habilitada** — sin agente ni corpus. Derecho civil patrimonial: responsabilidad por daños entre particulares (C.C. art. 1324 y conc.), contratos civiles (compraventa, préstamos, incumplimientos) y daños y perjuicios (C.C. art. 1345). El receptor la reconoce como tema aún no cubierto (`categoria-no-habilitada`), lo dice con honestidad y capta el contacto. **Decisión del equipo legal (2026-08-03): no avanzar con Civil por ahora — seguirán ampliando Familia.** Las consultas civiles registradas via `temaDetectado` son la señal de demanda para retomarlo. **Fronteras resueltas por el equipo legal (2026-08-03): el empleador demandado por el hecho de su dependiente y las compras entre particulares (p. ej. usados por Mercado Libre) son Civil** — no Tránsito ni Consumo — y hoy van al escape con captación. Archivo RESPONDIDO: `docs/preguntas-legales/2026-08-03-preguntas-codigo-civil.md` |

El Q&A del Código Civil (2026-08-03) que motivó la declaración trajo además piezas de **Familia** fundadas en el Código Civil (adulterio, filiación art. 220, compraventa entre cónyuges art. 1675) que se integraron al corpus de esa categoría. Ver `docs/plans/2026-08-03-procesamiento-preguntas-codigo-civil.md`.

## 2. Roadmap de habilitación

1. **v1 (ahora): solo Laboral → Despido.** Todo el pipeline (router → agente →
   sub-agente → RAG → cita de fuente) se construye y valida con esta única
   subcategoría.
2. **Siguientes categorías: se suman según demanda de los usuarios.** No hay un orden
   predefinido — el orden lo dicta qué consultas piden los usuarios reales. Al
   habilitar una categoría/subcategoría nueva, actualizar la columna "Estado" de las
   tablas de §1 con la fecha.
3. Las consultas que caen fuera de las categorías habilitadas deben recibir una
   respuesta honesta de "todavía no cubrimos ese tema" (nunca inventar respuesta sin
   corpus que la respalde) — y conviene registrarlas, porque son la señal de demanda
   que ordena el roadmap.

## 3. Implicaciones arquitectónicas

Mapeo taxonomía → arquitectura de agentes (patrones de `docs/guia-arquitectura.md` §2;
decisión formalizada en `docs/plans/2026-07-19-arquitectura-agentes-clasificacion.md`):

- **Router**: no es un agente separado ni una selección hecha por el frontend — el
  ruteo vive en el **BFF**, que lee `Conversation.categoria` (persistida en Prisma) y,
  si ya está asignada, llama directo al agente de esa categoría. Sin clasificación
  todavía, corre el **receptor global conversacional** (`recepcion`, memoria
  `readOnly`), único clasificador de todo el universo — no uno por categoría.
  Mecanismo completo en `guia-arquitectura.md` §2.1/§3.2 y en el spec §2-§3.
- **Categoría = agente principal (FE-invisible)**: cada área del derecho habilitada
  (Laboral, Familia, Tránsito, Arrendamiento y Desalojo, Relaciones de Consumo) se corresponde
  con un agente principal con identidad fija, dueño de la conversación completa y del
  funnel de venta (spec §4, §6) — nunca los sub-agentes.
- **Subcategoría = dato acumulativo del caso, no estado de ruteo**: se registra en
  `Caso.subcategorias` y parametriza el filtro de retrieval (`buscar-documentos` con
  WHERE por categoría/subcategoría sobre el corpus particionado), pero nunca dispara
  un salto a otro agente. **Corpus transversal**: el material que aplica a toda una
  categoría y no a una subcategoría (p. ej. prescripción y proceso laboral, que rigen
  tanto despido como rubros) se ingiere a **nivel categoría** (`Document.subcategoria =
  NULL`) y el retrieval lo mantiene siempre en alcance aunque el agente filtre por
  subcategorías (`... OR d."subcategoria" IS NULL`; ver
  `docs/plans/2026-07-21-procesamiento-prescripcion-proceso-laboral.md`). El **sub-agente especialista por subcategoría** (patrón
  Networks) descrito originalmente acá queda como **evolución opcional**: se promueve
  solo cuando las evals muestren que el prompt del agente de categoría degrada al
  discriminar entre las subcategorías de su área (spec §4, §9) — no como paso
  obligado de escalado.
- **División de responsabilidades**: el receptor clasifica (nivel 1, categoría) y
  capta contacto en el camino fuera-de-cobertura; el agente de categoría conduce la
  conversación completa, resuelve el nivel 2 (subcategoría) colapsado dentro de sí
  mismo, recupera evidencia con cita y capta el caso. Ninguna capa invade la
  responsabilidad de otra.
- **Escalar = agregar, no modificar**: habilitar una categoría o subcategoría nueva es
  agregar su carpeta bajo `backend/src/mastra/dominios/` + su entrada en el registry
  (`registry.ts`), sin tocar los agentes existentes. Ese es el criterio de éxito del
  diseño (spec §5).

La tensión que existía entre "el frontend elige el agente" y el diagrama de un router
delante de las categorías queda **cerrada**: el ruteo es responsabilidad exclusiva del
BFF, con la categoría persistida como fuente de verdad y el receptor global como único
punto de clasificación conversacional — nunca un router por categoría ni una selección
hecha en la UI. Decisión registrada en
`docs/plans/2026-07-19-arquitectura-agentes-clasificacion.md`.

## 4. Casos con tratamiento especial

- **Violencia de género** aparece destacada en el diagrama del dominio y **no se trata
  como una subcategoría más**. Su tratamiento diferencial quedó definido e implementado
  al habilitarla (2026-07-22), sobre la base del material del equipo legal (Ley 19.580 +
  síntesis de familia §9 y §16.4):
  - El **receptor** mantiene su protocolo de caso sensible: ante peligro actual,
    `casoSensible: true`, solo contención y canales de ayuda inmediata (rule
    `caso-sensible`).
  - El **agente familia** tiene el mismo protocolo para riesgo que aparece a mitad de
    conversación (rule `caso-sensible`, versión especialista: seguridad primero, la
    consulta legal después), y su rule de conducta (`conducta-familia`) prohíbe sugerir
    mediación/conciliación/contacto directo con el agresor y recomendar incumplir
    medidas vigentes.
  - La consulta **informativa** sobre violencia ya denunciada, sin peligro actual, se
    atiende como consulta de familia normal (no se corta hacia canales que la persona ya
    usó).
  - Pendiente del equipo legal: validación del protocolo y canales exactos (hoy: 911 y
    0800 4141, marcados como interinos desde el procesamiento de despido). Ver
    `docs/preguntas-legales/2026-07-22-familia.md`.
