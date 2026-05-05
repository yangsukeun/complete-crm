-- 퇴사 등: 계정 삭제 대신 로그인만 막기
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountDisabled" BOOLEAN NOT NULL DEFAULT false;
