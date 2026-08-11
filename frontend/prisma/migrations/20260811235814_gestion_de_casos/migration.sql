-- CreateEnum
CREATE TYPE "CasoGestion" AS ENUM ('NUEVO', 'CONTACTADO', 'DERIVADO', 'DESCARTADO');

-- AlterEnum
ALTER TYPE "CasoEventoTipo" ADD VALUE 'GESTION';

-- AlterTable
ALTER TABLE "Caso" ADD COLUMN     "gestion" "CasoGestion" NOT NULL DEFAULT 'NUEVO',
ADD COLUMN     "gestionEn" TIMESTAMP(3),
ADD COLUMN     "gestionNota" TEXT,
ADD COLUMN     "gestionPor" TEXT;

-- CreateIndex
CREATE INDEX "Caso_gestion_updatedAt_idx" ON "Caso"("gestion", "updatedAt" DESC);
