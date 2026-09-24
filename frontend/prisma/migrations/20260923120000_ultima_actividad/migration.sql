-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: el último mensaje persistido del thread, o la creación si el
-- thread no tiene mensajes. Sin esto, toda conversación existente quedaría
-- con la fecha de la migración y el board las mostraría como activas hoy.
UPDATE "Conversation" SET "ultimaActividad" = "createdAt";

-- Las tablas de `mastra` las crea el backend al arrancar, no Prisma: en una
-- base nueva todavía no existen y un UPDATE directo tumbaría la migración.
DO $$
BEGIN
  IF to_regclass('mastra.mastra_messages') IS NOT NULL THEN
    UPDATE "Conversation" c
    SET "ultimaActividad" = m.ultimo
    FROM (
      SELECT thread_id, MAX("createdAt") AS ultimo
      FROM mastra.mastra_messages
      GROUP BY thread_id
    ) m
    WHERE m.thread_id = c."threadId"
      AND m.ultimo > c."createdAt";
  END IF;
END $$;

-- CreateIndex
CREATE INDEX "Conversation_esRevision_ultimaActividad_idx" ON "Conversation"("esRevision", "ultimaActividad" DESC);
