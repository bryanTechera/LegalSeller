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
 * Mismo alcance para SQL crudo sobre el schema `mastra`, que no conoce el
 * flag. Requiere que la tabla de spans o mensajes esté aliasada como `s`.
 */
export const JOIN_REALES = Prisma.sql`
  JOIN public."Conversation" c
    ON c."threadId" = s."threadId"
   AND c."esRevision" = false
`;
