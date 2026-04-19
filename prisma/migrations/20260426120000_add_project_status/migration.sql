-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PREPARING', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'PREPARING';
ALTER TABLE "Project" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill: 마감일이 과거이면 완료
UPDATE "Project"
SET
  "status" = 'COMPLETED',
  "completedAt" = COALESCE("dueDate", CURRENT_TIMESTAMP)
WHERE
  "deletedAt" IS NULL
  AND "dueDate" IS NOT NULL
  AND "dueDate" < CURRENT_TIMESTAMP;

-- Backfill: 아직 준비중이면서 진행 중인 업무가 있으면 진행중
UPDATE "Project" p
SET "status" = 'IN_PROGRESS'
WHERE
  p."deletedAt" IS NULL
  AND p."status" = 'PREPARING'
  AND EXISTS (
    SELECT 1
    FROM "Task" t
    WHERE t."projectId" = p."id"
      AND t."deletedAt" IS NULL
      AND t."status" = 'IN_PROGRESS'
  );
