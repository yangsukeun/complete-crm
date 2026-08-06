-- 퇴사 등: 계정 삭제 대신 로그인만 막기
-- DB에는 이미 적용됨. 로컬 이력 복구용 (IF NOT EXISTS로 재실행 안전).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountDisabled" BOOLEAN NOT NULL DEFAULT false;
