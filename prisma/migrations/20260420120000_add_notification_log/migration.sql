-- NotificationLog: Cron 푸시·알림 중복 방지
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationLog_userId_kind_sentAt_idx" ON "NotificationLog"("userId", "kind", "sentAt");
CREATE INDEX "NotificationLog_taskId_kind_idx" ON "NotificationLog"("taskId", "kind");

ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- NotificationType 확장 (앱 알림 목록 타입)
ALTER TYPE "NotificationType" ADD VALUE 'TASK_ORPHAN';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE_D3';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE_D1';
ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'DAILY_DIGEST';
