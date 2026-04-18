-- Task 완료·아카이브 시각 (표시 레벨, 소프트 삭제 아님)
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Task_archivedAt_idx" ON "Task"("archivedAt");
CREATE INDEX "Task_status_completedAt_idx" ON "Task"("status", "completedAt");

-- 기존 완료 건: completedAt 없으면 updatedAt 으로 백필 (대략적 시작점)
UPDATE "Task"
SET "completedAt" = "updatedAt"
WHERE status = 'DONE' AND "completedAt" IS NULL;
