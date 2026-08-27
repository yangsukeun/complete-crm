-- AlterEnum
ALTER TYPE "TaskCreationSource" ADD VALUE 'GOOGLE';

-- AlterTable
ALTER TABLE "GoogleCalendarIntegration" ADD COLUMN "oauthScopes" TEXT;
ALTER TABLE "GoogleCalendarIntegration" ADD COLUMN "googleTasksSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "googleTaskId" TEXT;
ALTER TABLE "Task" ADD COLUMN "syncedFromGoogle" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Task_googleTaskId_key" ON "Task"("googleTaskId");
CREATE INDEX "Task_syncedFromGoogle_idx" ON "Task"("syncedFromGoogle");
