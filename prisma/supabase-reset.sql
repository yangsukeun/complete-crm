-- Supabase(PostgreSQL) DB 전체 초기화 스크립트
-- 실행 후 prisma/supabase-schema.sql 을 다시 실행하세요.

-- 1) 모든 테이블 삭제 (public 스키마)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;

-- 2) 모든 ENUM 타입 삭제
DROP TYPE IF EXISTS "Role" CASCADE;
DROP TYPE IF EXISTS "TaskPriority" CASCADE;
DROP TYPE IF EXISTS "TaskStatus" CASCADE;
DROP TYPE IF EXISTS "AttendanceStatus" CASCADE;
DROP TYPE IF EXISTS "LeaveType" CASCADE;
DROP TYPE IF EXISTS "LeaveRequestStatus" CASCADE;
DROP TYPE IF EXISTS "ScheduleInviteStatus" CASCADE;
DROP TYPE IF EXISTS "PaymentRequestStatus" CASCADE;
DROP TYPE IF EXISTS "QuotationStatus" CASCADE;
DROP TYPE IF EXISTS "AccessLogType" CASCADE;
DROP TYPE IF EXISTS "ActivityLogActionType" CASCADE;
DROP TYPE IF EXISTS "DailyWorkLogStatus" CASCADE;
DROP TYPE IF EXISTS "NotificationType" CASCADE;
DROP TYPE IF EXISTS "WorkspaceScope" CASCADE;
