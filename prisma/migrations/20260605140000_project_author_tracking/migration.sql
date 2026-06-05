-- 프로젝트 작성자/최종수정자 추적 (nullable, 기존 데이터 변경 없음)
ALTER TABLE "Project" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Project" ADD COLUMN "lastEditedById" TEXT;

ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_lastEditedById_fkey"
  FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");
CREATE INDEX "Project_lastEditedById_idx" ON "Project"("lastEditedById");
