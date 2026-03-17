-- 연차 이월: 전년도 미사용분을 당해 연도에 반영
-- AlterTable
ALTER TABLE "LeaveBalance" ADD COLUMN "annualCarryOver" DOUBLE PRECISION NOT NULL DEFAULT 0;
