-- Notification: relatedType/relatedId/readAt (nullable, backfill-friendly)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationRelatedType') THEN
    CREATE TYPE "NotificationRelatedType" AS ENUM (
      'PROJECT','TASK','CHAT','LEAVE','ATTENDANCE','FINANCE','BOARD','NOTICE','WORK_LOG','SYSTEM'
    );
  END IF;
END $$;

ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "relatedType" "NotificationRelatedType",
  ADD COLUMN IF NOT EXISTS "relatedId" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_user_related_idx"
  ON "Notification" ("userId","relatedType","relatedId");

CREATE INDEX IF NOT EXISTS "Notification_user_readAt_idx"
  ON "Notification" ("userId","readAt");

