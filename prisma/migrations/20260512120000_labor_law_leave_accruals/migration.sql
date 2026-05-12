-- 근로기준법 정합 연차 발생 단위 + 회사 설정 + 승인 시 FIFO 기록

CREATE TYPE "LeaveAccrualType" AS ENUM (
  'MONTHLY_UNDER_ONE_YEAR',
  'ANNUAL_AFTER_ONE_YEAR',
  'TENURE_BONUS',
  'CARRY_OVER'
);

CREATE TABLE "LeaveAccrual" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveAccrualType" NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "accrualDateYmd" VARCHAR(10) NOT NULL,
    "accruedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isExpired" BOOLEAN NOT NULL DEFAULT false,
    "expiredAt" TIMESTAMP(3),
    "compensationOwed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveAccrual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeaveAccrual_userId_type_accrualDateYmd_key" ON "LeaveAccrual"("userId", "type", "accrualDateYmd");
CREATE INDEX "LeaveAccrual_userId_expiresAt_idx" ON "LeaveAccrual"("userId", "expiresAt");
CREATE INDEX "LeaveAccrual_userId_isExpired_idx" ON "LeaveAccrual"("userId", "isExpired");
CREATE INDEX "LeaveAccrual_userId_type_idx" ON "LeaveAccrual"("userId", "type");

ALTER TABLE "LeaveAccrual" ADD CONSTRAINT "LeaveAccrual_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD COLUMN "accrualAllocations" JSONB;

ALTER TABLE "CompanyInfo" ADD COLUMN "useEncouragementEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CompanyInfo" ADD COLUMN "attendanceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'NotificationType' AND e.enumlabel = 'LEAVE_COMPENSATION'
  ) THEN
    ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_COMPENSATION';
  END IF;
END $$;
