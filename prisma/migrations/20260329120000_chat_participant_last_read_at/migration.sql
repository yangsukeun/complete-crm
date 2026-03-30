-- 읽음 표시용 (채팅) — 스키마와 DB 불일치 시 Prisma가 ChatParticipant 조회·쓰기에서 500 발생
ALTER TABLE "ChatParticipant" ADD COLUMN IF NOT EXISTS "lastReadAt" TIMESTAMP(3);
