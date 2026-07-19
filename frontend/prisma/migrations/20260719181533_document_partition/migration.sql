-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "subcategoria" TEXT;

-- CreateIndex
CREATE INDEX "Document_categoria_subcategoria_idx" ON "Document"("categoria", "subcategoria");
