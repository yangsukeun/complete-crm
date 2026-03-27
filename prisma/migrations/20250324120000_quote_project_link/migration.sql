-- 견적-프로젝트-업무 연동 (Prisma: Quotation.projectId / Project.quoteId·quoteAmount·dueDate / Task.projectId)
-- User↔Project 암시적 다대다 테이블명은 배포 환경에 따라 다를 수 있음. prisma db push/migrate 사용 권장.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "quoteId" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "quoteAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Project_quoteId_key" ON "Project"("quoteId");

CREATE INDEX IF NOT EXISTS "Quotation_projectId_idx" ON "Quotation"("projectId");
CREATE INDEX IF NOT EXISTS "Task_projectId_idx" ON "Task"("projectId");

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_quoteId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_projectId_fkey";
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_projectId_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
