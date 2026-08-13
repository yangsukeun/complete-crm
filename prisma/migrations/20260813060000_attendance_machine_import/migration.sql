-- 출퇴근 기록기 사원번호 + 기록기/수동 근태 테이블 (버튼 Attendance와 분리)

DO $$ BEGIN
  CREATE TYPE "AttendanceRecordSource" AS ENUM ('MACHINE_IMPORT', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "attendanceMachineNo" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_attendanceMachineNo_key"
  ON "User"("attendanceMachineNo");

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "clockIn" TIMESTAMP(3),
  "clockOut" TIMESTAMP(3),
  "source" "AttendanceRecordSource" NOT NULL,
  "raw" TEXT,
  "incomplete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_userId_date_source_key"
  ON "AttendanceRecord"("userId", "date", "source");

CREATE INDEX IF NOT EXISTS "AttendanceRecord_userId_idx" ON "AttendanceRecord"("userId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_source_date_idx" ON "AttendanceRecord"("source", "date");

DO $$ BEGIN
  ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
