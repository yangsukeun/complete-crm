-- 업무 본문 @멘션: 알림 타입 + TaskMention 테이블

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'NotificationType' AND e.enumlabel = 'TASK_BODY_MENTION') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'TASK_BODY_MENTION';
  END IF;
END $$;

CREATE TABLE "TaskMention" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskMention_taskId_userId_key" ON "TaskMention"("taskId", "userId");

CREATE INDEX "TaskMention_userId_idx" ON "TaskMention"("userId");

CREATE INDEX "TaskMention_taskId_idx" ON "TaskMention"("taskId");

ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskMention" ADD CONSTRAINT "TaskMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
