-- Add leave cancellation workflow.
-- Note: This migration is written to be deploy-friendly (no shadow DB required).

DO $$
BEGIN
  -- Add new enum values (PostgreSQL 12+ supports IF NOT EXISTS).
  BEGIN
    EXECUTE 'ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS ''CANCEL_REQUESTED''';
  EXCEPTION WHEN duplicate_object THEN
    -- ignore
  END;

  BEGIN
    EXECUTE 'ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS ''CANCELLED''';
  EXCEPTION WHEN duplicate_object THEN
    -- ignore
  END;
END $$;

ALTER TABLE "LeaveRequest"
ADD COLUMN IF NOT EXISTS "cancelFromStatus" TEXT;

