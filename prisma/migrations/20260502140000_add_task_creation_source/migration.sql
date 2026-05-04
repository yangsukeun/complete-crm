-- CreateEnum
CREATE TYPE "TaskCreationSource" AS ENUM ('PROJECT', 'MINDMAP', 'SCHEDULE', 'MEMO', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "creationSource" "TaskCreationSource" NOT NULL DEFAULT 'UNKNOWN';

-- CreateIndex
CREATE INDEX "Task_creationSource_idx" ON "Task"("creationSource");

CREATE INDEX "Task_assignedToId_creationSource_status_idx" ON "Task"("assignedToId", "creationSource", "status");
