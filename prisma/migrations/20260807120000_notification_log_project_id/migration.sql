-- NotificationLog: 프로젝트 마감 알림 중복 방지용 projectId
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationLog_projectId_fkey'
  ) THEN
    ALTER TABLE "NotificationLog"
      ADD CONSTRAINT "NotificationLog_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "NotificationLog_projectId_kind_idx"
  ON "NotificationLog"("projectId", "kind");
