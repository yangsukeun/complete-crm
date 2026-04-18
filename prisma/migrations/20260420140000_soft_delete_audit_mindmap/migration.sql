-- TaskComment / TaskAttachment 소프트 삭제
ALTER TABLE "TaskComment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "TaskAttachment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "TaskComment_deletedAt_idx" ON "TaskComment"("deletedAt");
CREATE INDEX IF NOT EXISTS "TaskAttachment_deletedAt_idx" ON "TaskAttachment"("deletedAt");

-- 마인드맵 직전 저장본
ALTER TABLE "UserTaskMindmapState" ADD COLUMN IF NOT EXISTS "previousPayload" JSONB;
ALTER TABLE "UserTaskMindmapState" ADD COLUMN IF NOT EXISTS "previousSavedAt" TIMESTAMP(3);

-- 감사 로그
CREATE TABLE "TaskAuditLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskAuditLog_taskId_createdAt_idx" ON "TaskAuditLog"("taskId", "createdAt");
CREATE INDEX "TaskAuditLog_actorId_createdAt_idx" ON "TaskAuditLog"("actorId", "createdAt");

ALTER TABLE "TaskAuditLog" ADD CONSTRAINT "TaskAuditLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAuditLog" ADD CONSTRAINT "TaskAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 부모 Task 하드 삭제 시 자식 parentId NULL (소프트 삭제 트리 유지)
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_parentId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
