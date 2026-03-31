-- CreateIndex
CREATE INDEX "BoardPost_category_createdAt_idx" ON "BoardPost"("category", "createdAt" DESC);
