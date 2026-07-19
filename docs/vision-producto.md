# Visión de producto — qué problema resuelve LegalSeller

> Fuente de verdad del propósito del sistema. Toda decisión técnica (diseño de
> agentes, prompts, modelo de datos, métricas) debe poder justificarse contra este
> documento. Registrada el 2026-07-19. Complementa `docs/dominio-consultas.md`
> (qué temas se atienden) — este doc define **para qué** se atienden.

## 1. El problema

Una persona con un problema legal (un despido, un desalojo, una pensión alimenticia)
tiene dudas comunes y urgentes, pero le cuesta dar el paso de contactar a un abogado:
no sabe si su caso "amerita", no sabe cuánto cuesta, no sabe a quién acudir y
desconfía. Del otro lado, hay una **red de abogados** con capacidad de tomar esos
casos, pero sin un canal que les acerque clientes calificados.

## 2. Qué es el sistema

LegalSeller es un **vendedor experto de servicios legales**: un sistema conversacional
que escucha al usuario, evacúa sus dudas comunes con respaldo en el corpus legal, le
genera confianza y, sobre esa confianza, **capta el caso**: pide los datos de contacto
y registra junto a ellos toda la información relevante recabada durante la
conversación. Ese caso queda disponible para que un **equipo especializado humano**
lo clasifique y lo derive a un abogado experto de la red.

No es un sustituto del abogado ni un servicio de asesoramiento legal definitivo: es
la puerta de entrada que convierte una duda en un caso derivable.

## 3. El funnel (flujo central del producto)

```
1. ESCUCHAR    El usuario cuenta su problema en el chat.
2. EVACUAR     El agente responde las dudas comunes de la categoría,
               con citas del corpus legal. Acá se construye la confianza.
3. RECABAR     Durante la conversación, el agente va recopilando los datos
               relevantes del caso (hechos, fechas, situación).
4. CONVERTIR   En el momento oportuno, el agente solicita los datos de
               contacto del usuario.
5. REGISTRAR   Contacto + información del caso quedan persistidos como un
               "caso captado" (lead).
6. DERIVAR     (Humano, fuera del sistema conversacional) El equipo
               especializado clasifica el caso y lo asigna a un abogado
               de la red.
```

La conversión (pasos 4–5) **depende** de la calidad de los pasos 1–3: el usuario deja
sus datos porque el sistema demostró que entiende su problema. Nunca pedir el contacto
antes de haber aportado valor; nunca condicionar las respuestas a que lo deje.

## 4. Definición de éxito

- **Métrica principal: casos captados** — conversaciones que terminan con datos de
  contacto + información del caso registrados.
- **Métrica de calidad: derivabilidad del caso** — que la información recabada le
  alcance al equipo humano para clasificar y derivar sin volver a preguntar lo básico.
- Métricas de soporte: conversaciones iniciadas, tasa de conversión
  (captados/iniciadas), consultas fuera de cobertura (alimentan el roadmap de
  `docs/dominio-consultas.md` §2).

## 5. Implicaciones técnicas

Decisiones que se derivan de esta visión (guiarse por esto al diseñar):

- **Doble objetivo en los agentes**: cada agente principal no solo responde — conduce
  un funnel. Su prompt debe balancear "evacuar dudas con citas" (skills de dominio)
  con "detectar el momento de pedir contacto" (skill de venta). Son responsabilidades
  del **agente principal** de cada categoría; los sub-agentes especialistas solo
  recuperan/estructuran evidencia y no participan de la conversión.
- **Recopilación estructurada del caso**: la información del caso (hechos, fechas,
  categoría/subcategoría, datos de contacto) debe capturarse de forma estructurada
  durante la conversación — no reconstruirse después parseando el transcript. Esto
  define el uso de working memory del agente y/o una tool de registro de caso con
  contrato Zod.
- **Modelo de datos orientado al lead**: el caso captado es una entidad de negocio
  propia en Prisma (contacto + resumen del caso + categoría + referencia a la
  conversación de origen), no un subproducto del historial de chat. Es **el**
  entregable del sistema.
- **Back-office humano**: el paso 6 exige que los casos captados sean consultables por
  el equipo especializado (aunque en el MVP sea algo mínimo: una vista interna o un
  export). Al diseñarlo, recordar que clasificación y derivación son humanas — el
  sistema no asigna abogados.
- **PII de primera clase**: nombre, teléfono, email del usuario son datos personales
  sensibles. Aplica con más fuerza todo lo ya definido: redacción de PII en logs,
  aislamiento por sesión, y nunca exponer datos de un caso fuera de su sesión/equipo.
- **Confianza = precisión + honestidad**: la confianza que sostiene la conversión se
  construye con respuestas correctas y citadas (regla SIEMPRE de `CLAUDE.md`) y con
  reconocer límites ("eso lo va a evaluar el abogado que tome tu caso" es una
  respuesta válida y además empuja el funnel). Una respuesta inventada destruye
  exactamente lo que el producto vende.
- **Fuera de cobertura también convierte**: si la consulta cae fuera de las categorías
  habilitadas, igual puede ofrecerse la captación ("todavía no cubrimos ese tema en
  detalle, pero dejanos tu contacto y vemos si un abogado de la red puede tomarlo") —
  decidir por categoría cuando se implemente.
