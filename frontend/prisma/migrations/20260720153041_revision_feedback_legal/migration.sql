-- CreateEnum
CREATE TYPE "NotaEstado" AS ENUM ('ABIERTA', 'RESPONDIDA', 'RESUELTA');

-- CreateEnum
CREATE TYPE "AutorOrigen" AS ENUM ('EXPERTO', 'DEV');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "creadaPor" TEXT,
ADD COLUMN     "esRevision" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "titulo" TEXT;

-- CreateTable
CREATE TABLE "NotaRevision" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "citaTexto" TEXT,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "estado" "NotaEstado" NOT NULL DEFAULT 'ABIERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespuestaNota" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "origen" "AutorOrigen" NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespuestaNota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotaRevision_conversationId_estado_idx" ON "NotaRevision"("conversationId", "estado");

-- CreateIndex
CREATE INDEX "RespuestaNota_notaId_createdAt_idx" ON "RespuestaNota"("notaId", "createdAt");

-- AddForeignKey
ALTER TABLE "NotaRevision" ADD CONSTRAINT "NotaRevision_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaNota" ADD CONSTRAINT "RespuestaNota_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "NotaRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
