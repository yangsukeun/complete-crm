-- CreateEnum
CREATE TYPE "TaskStageStatus" AS ENUM ('PENDING', 'ACTIVE', 'DONE');

-- CreateTable
CREATE TABLE "TaskStage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TaskStageStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStageAssignee" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "lastNote" TEXT,
    "lastSavedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStageAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStageProgress" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStageProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStageTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stageNames" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskStageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskStage_taskId_orderIndex_idx" ON "TaskStage"("taskId", "orderIndex");

-- CreateIndex
CREATE INDEX "TaskStage_status_idx" ON "TaskStage"("status");

-- CreateIndex
CREATE INDEX "TaskStageAssignee_userId_idx" ON "TaskStageAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStageAssignee_stageId_userId_key" ON "TaskStageAssignee"("stageId", "userId");

-- CreateIndex
CREATE INDEX "TaskStageProgress_stageId_createdAt_idx" ON "TaskStageProgress"("stageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStageTemplate_name_key" ON "TaskStageTemplate"("name");

-- AddForeignKey
ALTER TABLE "TaskStage" ADD CONSTRAINT "TaskStage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStageAssignee" ADD CONSTRAINT "TaskStageAssignee_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TaskStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStageAssignee" ADD CONSTRAINT "TaskStageAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStageProgress" ADD CONSTRAINT "TaskStageProgress_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TaskStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStageProgress" ADD CONSTRAINT "TaskStageProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

