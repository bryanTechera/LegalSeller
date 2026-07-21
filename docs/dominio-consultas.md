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

El sistema completo atiende **4 categorías** (áreas del derecho), cada una con sus
subcategorías (tipos de consulta). Delante de todas hay un **router** que recibe la
consulta del usuario y la dirige a la categoría correspondiente.

```
                          Usuario
                             │
                        ┌────▼────┐
                        │ ROUTER  │
                        └────┬────┘
      ┌──────────────┬───────┴──────────┬────────────────────┐
      ▼              ▼                  ▼                    ▼
   LABORAL        FAMILIA        ARRENDAMIENTO         RELACIONES DE
                                  Y DESALOJO             CONSUMO
```

### Laboral
| Subcategoría | Estado |
|---|---|
| **Despido** | ✅ **v1 — punto de partida** |
| **Rubros laborales** | ✅ **habilitada 2026-07-19** (material del equipo legal: jornada/horas extras, descansos/licencia/salario vacacional/aguinaldo, salario, trabajo nocturno) |
| Licencias especiales | Pendiente |
| Accidentes laborales | Pendiente |

### Familia
| Subcategoría | Estado |
|---|---|
| Pensión alimenticia, tenencia y visitas | Pendiente |
| Divorcio, sociedad conyugal | Pendiente |
| Sucesiones | Pendiente |
| Unión concubinaria | Pendiente |
| Violencia de género | Pendiente — ⚠️ destacada en el diagrama; ver §4 |

### Arrendamiento y desalojo
| Subcategoría | Estado |
|---|---|
| Contrato de alquiler | Pendiente |
| Desalojo ley 8153 | Pendiente |
| Desalojo ley 14219 | Pendiente |
| Desalojo ley 19980 | Pendiente |
| Cobro alquileres | Pendiente |

### Relaciones de consumo
| Subcategoría | Estado |
|---|---|
| Derechos del consumidor | Pendiente |
| Procedimiento ante MEF y poder judicial | Pendiente |

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
  (Laboral, Familia, Arrendamiento y Desalojo, Relaciones de Consumo) se corresponde
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

- **Violencia de género** aparece destacada en el diagrama del dominio. Antes de
  habilitarla, definir su tratamiento diferencial (p. ej. derivación inmediata a
  canales de ayuda/urgencia además de —o en lugar de— la respuesta informativa
  estándar). No tratarla como una subcategoría más.
