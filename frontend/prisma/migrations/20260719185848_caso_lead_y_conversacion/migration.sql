-- CreateEnum
CREATE TYPE "CasoEstado" AS ENUM ('EN_CONVERSACION', 'CAPTADO', 'FUERA_DE_COBERTURA');

-- CreateEnum
CREATE TYPE "CasoOrigen" AS ENUM ('DOMINIO', 'FUERA_DE_COBERTURA');

-- CreateEnum
CREATE TYPE "CasoEventoTipo" AS ENUM ('CLASIFICACION', 'CORRECCION', 'REGISTRO_DATO', 'CONTACTO');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "categoria" TEXT,
    "clasificadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Caso" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "categoria" TEXT,
    "subcategorias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resumen" JSONB,
    "contactoNombre" TEXT,
    "contactoTelefono" TEXT,
    "contactoEmail" TEXT,
    "estado" "CasoEstado" NOT NULL DEFAULT 'EN_CONVERSACION',
    "origen" "CasoOrigen" NOT NULL DEFAULT 'DOMINIO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Caso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasoEvento" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "tipo" "CasoEventoTipo" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CasoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_sessionId_key" ON "Conversation"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_threadId_key" ON "Conversation"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Caso_conversationId_key" ON "Caso"("conversationId");

-- CreateIndex
CREATE INDEX "Caso_estado_updatedAt_idx" ON "Caso"("estado", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "CasoEvento_casoId_createdAt_idx" ON "CasoEvento"("casoId", "createdAt");

-- AddForeignKey
ALTER TABLE "Caso" ADD CONSTRAINT "Caso_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasoEvento" ADD CONSTRAINT "CasoEvento_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "Caso"("id") ON DELETE CASCADE ON UPDATE CASCADE;
