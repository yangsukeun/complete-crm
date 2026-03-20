-- 계정 삭제 시에도 견적·이체·업무 데이터 유지: User FK를 SetNull로 변경
-- NotificationType에 CHAT_MESSAGE, NOTICE_POSTED 추가 (이미 있으면 무시)

-- Enum 추가 (이미 있으면 스킵)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'NotificationType' AND e.enumlabel = 'CHAT_MESSAGE') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'CHAT_MESSAGE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'NotificationType' AND e.enumlabel = 'NOTICE_POSTED') THEN
    ALTER TYPE "NotificationType" ADD VALUE 'NOTICE_POSTED';
  END IF;
END $$;

-- Task: 담당/생성자 nullable + onDelete SetNull (DB는 nullable만 적용)
ALTER TABLE "Task" ALTER COLUMN "assignedToId" DROP NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "createdById" DROP NOT NULL;

-- TaskRevision
ALTER TABLE "TaskRevision" ALTER COLUMN "userId" DROP NOT NULL;

-- TaskComment
ALTER TABLE "TaskComment" ALTER COLUMN "userId" DROP NOT NULL;

-- PaymentRequest
ALTER TABLE "PaymentRequest" ALTER COLUMN "requesterId" DROP NOT NULL;

-- Quotation
ALTER TABLE "Quotation" ALTER COLUMN "issuedById" DROP NOT NULL;
