import "server-only";

import { Prisma } from "@prisma/client";

/**
 * Alcance de TODA métrica de negocio: solo conversaciones de consultantes
 * reales. Las sesiones de revisión (`esRevision`) son pruebas del equipo
 * legal y corridas del runner de escenarios; contarlas infla el funnel y el
 * costo reportado. El flag cubre también los borradores, porque las corridas
 * autónomas se crean como sesiones de revisión.
 */
export function conversacionesReales(desde: Date | null): Prisma.ConversationWhereInput {
  return { esRevision: false, ...(desde ? { createdAt: { gte: desde } } : {}) };
}

/**
 * Alcance para queries que parten de `Caso` en vez de `Conversation`. Compone
 * sobre `conversacionesReales` en vez de repetir la condición: si algún día
 * "real" pasa a significar algo más, este helper lo hereda solo.
 */
export function casosReales(desde: Date | null): Prisma.CasoWhereInput {
  return {
    conversation: conversacionesReales(null),
    ...(desde ? { createdAt: { gte: desde } } : {}),
  };
}

/**
 * Mismo alcance para SQL crudo sobre el schema `mastra`, que no conoce el
 * flag. Requiere que la tabla de spans o mensajes esté aliasada como `s`.
 */
export const JOIN_REALES = Prisma.sql`
  JOIN public."Conversation" c
    ON c."threadId" = s."threadId"
   AND c."esRevision" = false
`;

/**
 * Alcance para SQL crudo que parte de `Caso`. Requiere los alias `caso` y
 * `conv`. Existe para que ninguna query escriba la condición a mano: la
 * duplicación es justamente el modo de falla que este módulo previene.
 */
export const JOIN_CASO_REAL = Prisma.sql`
  JOIN "Conversation" conv
    ON conv.id = caso."conversationId"
   AND conv."esRevision" = false
`;

/**
 * Alcance para SQL crudo donde `Conversation` ya es la tabla base (alias
 * `c`) — sin join, a diferencia de JOIN_REALES (arranca desde spans/mensajes)
 * o JOIN_CASO_REAL (arranca desde Caso). Va en el WHERE, no en un JOIN:
 * como filtra por una columna de `c` (la tabla base, o el lado izquierdo de
 * un LEFT JOIN opcional hacia `mastra`), no corre el riesgo de convertir un
 * LEFT JOIN en INNER — ese riesgo solo existe al filtrar por el lado
 * outer-joined.
 */
export const WHERE_REALES = Prisma.sql`c."esRevision" = false`;
