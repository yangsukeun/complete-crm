-- Hotfix migration: 일부 운영 DB에서 BoardPost 컬럼 누락으로 500(P2022) 발생.
-- 안전하게 컬럼을 추가합니다.

ALTER TABLE "BoardPost"
  ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "BoardPost"
  ADD COLUMN IF NOT EXISTS "mentionedUserIds" TEXT NOT NULL DEFAULT '[]';

