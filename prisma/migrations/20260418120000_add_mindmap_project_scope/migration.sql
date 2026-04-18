-- 마인드맵 UI 상태를 캔버스(전체/미분류/프로젝트)별로 분리 저장
-- 기존 (userId, scope) 단일 행은 projectId = '__ALL__' 로 승격되어 전체 조감도 레이아웃으로 유지됩니다.

ALTER TABLE "UserTaskMindmapState" ADD COLUMN IF NOT EXISTS "projectId" TEXT NOT NULL DEFAULT '__ALL__';

UPDATE "UserTaskMindmapState" SET "projectId" = '__ALL__' WHERE "projectId" IS NULL OR TRIM("projectId") = '';

ALTER TABLE "UserTaskMindmapState" DROP CONSTRAINT IF EXISTS "UserTaskMindmapState_pkey";

ALTER TABLE "UserTaskMindmapState" ADD CONSTRAINT "UserTaskMindmapState_pkey" PRIMARY KEY ("userId", "scope", "projectId");
