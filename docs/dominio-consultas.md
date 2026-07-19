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
| Rubros laborales | Pendiente |
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

Mapeo taxonomía → arquitectura de agentes (patrones de `docs/guia-arquitectura.md` §2):

- **Router**: es el punto de entrada de toda consulta. Su única responsabilidad es
  clasificar la consulta en una categoría habilitada (o rechazarla con gracia si no
  está cubierta). En v1, con una sola subcategoría habilitada, el router puede ser
  trivial; su implementación concreta (agente clasificador vs. selección desde el FE)
  se decide al habilitar la segunda categoría — ver nota abajo.
- **Categoría = agente principal (FE-facing)**: cada área del derecho (Laboral,
  Familia, Arrendamiento y Desalojo, Relaciones de Consumo) se corresponde con un
  agente principal con identidad fija, prompt e instrucciones propias del área.
- **Subcategoría = sub-agente especialista** (patrón Networks): cada tipo de consulta
  (Despido, Sucesiones, Desalojo ley 14219, …) es un sub-agente experto en su corpus
  normativo específico, que devuelve datos estructurados y citas al agente principal.
  El corpus documental se etiqueta/particiona por subcategoría para que cada
  sub-agente recupere solo de su ámbito.
- **División de responsabilidades**: router clasifica; agente principal de categoría
  conduce la conversación, delega y compone la respuesta con citas; sub-agente de
  subcategoría recupera y estructura evidencia de su corpus. Ninguna capa invade la
  responsabilidad de otra.
- **Escalar = agregar, no modificar**: habilitar una subcategoría nueva debe consistir
  en agregar un sub-agente + su corpus (y, si es la primera de su área, el agente
  principal de la categoría), sin tocar los agentes existentes. Ese es el criterio de
  éxito del diseño.

> **Nota — tensión a resolver**: `guia-arquitectura.md` §2.1 dice hoy "el frontend
> elige el agente y el backend no rutea entre agentes principales". El diagrama del
> dominio pone un ROUTER delante de las categorías. En v1 no hay conflicto (una sola
> categoría). Antes de habilitar la segunda categoría hay que decidir dónde vive el
> ruteo (clasificador en backend vs. selección explícita en la UI) y actualizar la
> guía de arquitectura en consecuencia.

## 4. Casos con tratamiento especial

- **Violencia de género** aparece destacada en el diagrama del dominio. Antes de
  habilitarla, definir su tratamiento diferencial (p. ej. derivación inmediata a
  canales de ayuda/urgencia además de —o en lugar de— la respuesta informativa
  estándar). No tratarla como una subcategoría más.
