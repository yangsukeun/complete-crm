-- DriveFile soft-trash + DriveActivityLog
CREATE TYPE "DriveActivityAction" AS ENUM ('DELETE', 'RESTORE', 'RENAME', 'MOVE');

ALTER TABLE "DriveFile" ADD COLUMN IF NOT EXISTS "trashed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DriveFile" ADD COLUMN IF NOT EXISTS "trashedAt" TIMESTAMP(3);
ALTER TABLE "DriveFile" ADD COLUMN IF NOT EXISTS "trashedBy" TEXT;
ALTER TABLE "DriveFile" ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;

CREATE INDEX IF NOT EXISTS "DriveFile_trashed_idx" ON "DriveFile"("trashed");
CREATE INDEX IF NOT EXISTS "DriveFile_trashed_rootId_idx" ON "DriveFile"("trashed", "rootId");

DO $$ BEGIN
  ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_trashedBy_fkey"
    FOREIGN KEY ("trashedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_updatedBy_fkey"
    FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DriveActivityLog" (
  "id" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "action" "DriveActivityAction" NOT NULL,
  "actorId" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriveActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DriveActivityLog_driveFileId_createdAt_idx" ON "DriveActivityLog"("driveFileId", "createdAt");
CREATE INDEX IF NOT EXISTS "DriveActivityLog_actorId_createdAt_idx" ON "DriveActivityLog"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "DriveActivityLog_createdAt_idx" ON "DriveActivityLog"("createdAt");

DO $$ BEGIN
  ALTER TABLE "DriveActivityLog" ADD CONSTRAINT "DriveActivityLog_driveFileId_fkey"
    FOREIGN KEY ("driveFileId") REFERENCES "DriveFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DriveActivityLog" ADD CONSTRAINT "DriveActivityLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
