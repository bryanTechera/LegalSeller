-- CreateTable
CREATE TABLE "SintesisCaso" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "huella" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "generadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SintesisCaso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaCaso" (
    "id" TEXT NOT NULL,
    "casoId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaCaso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SintesisCaso_casoId_key" ON "SintesisCaso"("casoId");

-- CreateIndex
CREATE INDEX "NotaCaso_casoId_createdAt_idx" ON "NotaCaso"("casoId", "createdAt");

-- AddForeignKey
ALTER TABLE "SintesisCaso" ADD CONSTRAINT "SintesisCaso_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "Caso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCaso" ADD CONSTRAINT "NotaCaso_casoId_fkey" FOREIGN KEY ("casoId") REFERENCES "Caso"("id") ON DELETE CASCADE ON UPDATE CASCADE;
