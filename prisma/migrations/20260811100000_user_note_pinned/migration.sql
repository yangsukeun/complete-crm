-- AlterTable
ALTER TABLE "UserNote" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "UserNote_userId_pinned_idx" ON "UserNote"("userId", "pinned");
