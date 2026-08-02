-- CreateIndex
CREATE INDEX "Conversation_esRevision_createdAt_idx" ON "Conversation"("esRevision", "createdAt" DESC);
