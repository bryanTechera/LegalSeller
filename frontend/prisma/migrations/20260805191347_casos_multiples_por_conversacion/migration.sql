-- DropIndex
DROP INDEX "Caso_conversationId_key";

-- AlterTable
ALTER TABLE "Caso" ADD COLUMN     "correccionAplicada" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Conversation" DROP COLUMN "correccionAplicada",
ADD COLUMN     "casoActivoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Caso_conversationId_categoria_key" ON "Caso"("conversationId", "categoria");

-- Backfill: cada conversación adopta su Caso existente como activo.
UPDATE "Conversation" c
SET "casoActivoId" = k.id
FROM "Caso" k
WHERE k."conversationId" = c.id AND c."casoActivoId" IS NULL;
