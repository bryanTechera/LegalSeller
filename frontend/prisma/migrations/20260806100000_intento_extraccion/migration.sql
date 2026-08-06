-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "intentosExtraccion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reglasExtraccion" TEXT[] DEFAULT ARRAY[]::TEXT[];
