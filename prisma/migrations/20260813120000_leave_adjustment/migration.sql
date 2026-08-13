-- 관리자 연차 가감 조정: 발생 유형 + 이력 테이블

DO $$ BEGIN
  ALTER TYPE "LeaveAccrualType" ADD VALUE 'MANUAL_ADJUSTMENT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LeaveAdjustment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "days" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeaveAdjustment_userId_createdAt_idx"
  ON "LeaveAdjustment"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "LeaveAdjustment" ADD CONSTRAINT "LeaveAdjustment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LeaveAdjustment" ADD CONSTRAINT "LeaveAdjustment_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
