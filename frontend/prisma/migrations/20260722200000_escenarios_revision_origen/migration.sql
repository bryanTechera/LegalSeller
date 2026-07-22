-- CreateEnum
CREATE TYPE "RevisionOrigen" AS ENUM ('EXPERTO', 'AUTONOMA');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "borrador" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "origenRevision" "RevisionOrigen";

-- Backfill: toda sesión de revisión existente fue creada por un experto.
UPDATE "Conversation" SET "origenRevision" = 'EXPERTO' WHERE "esRevision" = true;
