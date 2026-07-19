# Análisis de referencia: Álex AI (Legálitas)

**Fecha:** 2026-07-19
**Propósito:** Álex AI ([alexlegal.ai](https://alexlegal.ai)) es la plataforma de referencia para LegalSeller: un asistente legal de IA para consumidor final, respaldado por Legálitas, muy cercano a lo que queremos construir (agentes de IA + RAG sobre documentos legales). Este documento resume qué hace, cómo le va y qué decisiones de producto podemos derivar para nuestro MVP.

> Nota: los datos provienen de la web pública de Álex y de comunicados de prensa de Legálitas (marzo y julio 2026). La página del chat en sí no publica estadísticas.

---

## 1. Qué es Álex AI

- Asistente legal conversacional (chat) especializado en Derecho español, lanzado el 26 de mayo de 2025 por Legálitas.
- Propuesta de valor: *"Resuelve tus dudas legales en segundos. Gratis y sin esperas"* — disponibilidad 24/7, respuestas en lenguaje llano, sin jerga.
- Canales: web + app móvil (iOS/Android, ~300.000 descargas, rating 4,8/5).
- Base de conocimiento: construida a partir de **más de 5 millones de consultas legales reales** y asesoramientos de **más de 800 abogados** de Legálitas, además de normativa y jurisprudencia (BOE).
- Privacidad como argumento de venta: las conversaciones **no se usan para entrenar modelos fundacionales**; cumplimiento RGPD explícito.

## 2. Tracción (benchmark de mercado)

| Métrica | Valor | Fecha |
|---|---|---|
| Usuarios únicos | 1.000.000 (mitad app, mitad web) | jul 2026 |
| Consultas respondidas | +2.000.000 en el primer año | jul 2026 |
| Consultas diarias | ~15.000 | mar 2026 |
| Derivaciones a abogados humanos | +6.000 usuarios/mes | jul 2026 |
| Previsión 2026 | 2M usuarios, 6M consultas | jul 2026 |

Lectura: hay demanda real y masiva de orientación legal gratuita en español, y el volumen se concentra en pocas materias (ver §3).

## 3. Distribución de consultas por categoría

Dato clave para decidir **qué agentes construir primero y con qué corpus**.

| Categoría | jul 2026 | mar 2026 |
|---|---|---|
| Laboral (despidos, contratos, bajas) | **40%** | 34,7% |
| Vivienda y alquileres | **12%** | 14,8% |
| Consumo (reclamaciones, suministros) | **10%** | — |
| Familia, banca, extranjería y otras | 38% restante (sin desglose público) | — |

Observaciones:

- Lo **laboral no solo domina, sino que crece** (34,7% → 40% en ~4 meses). Un solo agente laboral bien hecho cubre casi la mitad del volumen esperable.
- Laboral + vivienda + consumo ≈ **62%** del tráfico con solo 3 verticales.
- Las materias donde Álex deriva a humanos (Ley de Segunda Oportunidad, laboral complejo, extranjería) marcan el límite de lo que la IA resuelve sola — y una oportunidad de monetización.

## 4. Producto y UX

**Flujo principal:**

1. Landing → CTA "Preguntar a Alex" (se puede usar **sin registro**; el registro gratuito guarda las consultas).
2. El chat muestra **preguntas de ejemplo por categoría** como punto de entrada ("¿Me pueden despedir estando de baja médica?", "¿Qué hacer si no puedo pagar el alquiler?", "¿Cómo se pide la custodia compartida?", "¿Qué pasa si mi visado caduca en España?").
3. Respuesta en segundos, con disclaimer permanente: *"puede cometer errores, verifica la información importante"* y *"no sustituye a un abogado"*.
4. Escalado: si la consulta excede a la IA, deriva a abogados de Legálitas (funnel comercial).

**Funcionalidades más allá del chat:**

- Comunidades temáticas (trabajo, familia, inquilinos, propietarios, extranjería, consumo) — retención y SEO.
- Herramientas utilitarias: calculadoras (sueldo neto, préstamos, interés compuesto) — captación de tráfico.
- Para abogados: análisis de documentos, detección de cláusulas de riesgo, borradores de demandas/contratos (línea de producto B2B separada).

**Señales de confianza en la landing:** contadores (2M+ consultas, 800+ abogados de respaldo), rating, respaldo de marca establecida.

## 5. Modelo de negocio

- **Freemium con funnel a servicios legales**: el chat es gratuito e ilimitado en apariencia; el negocio está en derivar casos complejos a los abogados de Legálitas (+6.000 leads/mes cualificados).
- La gratuidad del chat es el motor de adquisición; el asistente actúa como **triaje y calificador de leads**.

## 6. Implicaciones para LegalSeller

### Priorización de agentes (por volumen de mercado)

1. **Agente laboral** — 40% del volumen. Corpus: Estatuto de los Trabajadores, convenios, jurisprudencia de despidos/bajas. *(Adaptar a la jurisdicción objetivo de LegalSeller si no es España.)*
2. **Agente de vivienda/alquileres** — 12%. Corpus: LAU, contratos de arrendamiento tipo.
3. **Agente de consumo** — 10%. Corpus: normativa de consumo, reclamaciones a suministros.
4. Resto (familia, extranjería, banca) — segunda ola; considerar un **agente generalista de triaje** que enrute a los especializados y responda lo demás con disclaimer reforzado.

Esto encaja con nuestra arquitectura multi-agente: un agente router/triaje + agentes verticales por materia, cada uno con su índice RAG acotado (mejor precisión de retrieval que un índice único gigante).

### Decisiones de producto a imitar

- **Chat sin fricción**: permitir preguntar sin registro; registro solo para guardar historial.
- **Preguntas de ejemplo por categoría** en el estado vacío del chat — reducen la barrera de entrada y a la vez telemetrizan qué categoría interesa.
- **Citar fuentes siempre** (regla que ya tenemos en CLAUDE.md) — Álex lo usa como diferenciador anti-alucinaciones frente a IAs generalistas.
- **Disclaimer persistente** ("no sustituye a un abogado", "puede cometer errores") — imprescindible legalmente y visible en todo momento.
- **Escalado a humano** como salida digna cuando el agente no llega — aunque en nuestro MVP sea solo un mensaje de "consultá con un profesional", dejar el hook diseñado.
- **Privacidad explícita**: comprometerse a no usar conversaciones para entrenamiento; es argumento de confianza en este dominio.

### Métricas a instrumentar desde el día 1

Álex demuestra que la distribución por categoría es el dato que guía el roadmap. Registrar por consulta: categoría (clasificada por el router), si hubo respuesta con cita o degradación, y si se sugirió escalar a humano. Eso nos da nuestra propia tabla del §3.

### Qué NO copiar en el MVP

- Comunidades, calculadoras y app móvil: son capas de adquisición/retención de una empresa consolidada, fuera del alcance del MVP.
- Línea B2B para abogados (análisis de documentos, borradores): producto distinto; no mezclar.

---

## Fuentes

- [alexlegal.ai — landing](https://alexlegal.ai/) y [alexlegal.ai/chat](https://alexlegal.ai/chat)
- [Derecho Práctico — Álex alcanza un millón de usuarios únicos en un año](https://derechopractico.es/alex-el-asistente-legal-de-ia-consolida-un-nuevo-modelo-de-acceso-a-la-justicia-alcanzando-un-millon-de-usuarios-unicos-en-un-ano/) (jul 2026)
- [WWWhatsnew — Álex, el asistente legal de IA de Legálitas, +600.000 usuarios](https://wwwhatsnew.com/2026/03/19/alex-el-asistente-legal-de-ia-de-legalitas-que-ya-usan-mas-de-600-000-personas-en-espana/) (mar 2026)
- [Legálitas — nota de prensa](https://www.legalitas.com/actualidad/alex-asistente-legal)
- [Marketing Jurídico — reseña de Alex AI como copiloto para abogados](https://marketing-juridico.com/resena-de-alex-ai-el-copiloto-definitivo-para-abogados-en-2026/)
