-- CreateTable
CREATE TABLE "Visita" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referrerHost" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visita_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visita_createdAt_idx" ON "Visita"("createdAt");

-- CreateIndex
CREATE INDEX "Visita_sessionId_createdAt_idx" ON "Visita"("sessionId", "createdAt");
