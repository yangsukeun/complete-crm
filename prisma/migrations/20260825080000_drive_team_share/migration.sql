-- DriveTeamShare: 폴더 단위 CRM↔공유 규칙
CREATE TYPE "DriveTeamShareTargetType" AS ENUM ('DEPARTMENT', 'USER');
CREATE TYPE "DriveTeamShareRole" AS ENUM ('READER', 'WRITER');

CREATE TABLE IF NOT EXISTS "DriveTeamShare" (
  "id" TEXT NOT NULL,
  "googleFolderId" TEXT NOT NULL,
  "folderName" TEXT NOT NULL,
  "targetType" "DriveTeamShareTargetType" NOT NULL,
  "department" TEXT,
  "userId" TEXT,
  "role" "DriveTeamShareRole" NOT NULL DEFAULT 'READER',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3),
  "lastSyncSummary" TEXT,
  "lastSyncErrors" JSONB,
  "needsResync" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DriveTeamShare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DriveTeamShare_googleFolderId_idx" ON "DriveTeamShare"("googleFolderId");
CREATE INDEX IF NOT EXISTS "DriveTeamShare_department_idx" ON "DriveTeamShare"("department");
CREATE INDEX IF NOT EXISTS "DriveTeamShare_userId_idx" ON "DriveTeamShare"("userId");
CREATE INDEX IF NOT EXISTS "DriveTeamShare_needsResync_idx" ON "DriveTeamShare"("needsResync");

DO $$ BEGIN
  ALTER TABLE "DriveTeamShare" ADD CONSTRAINT "DriveTeamShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DriveTeamShare" ADD CONSTRAINT "DriveTeamShare_createdBy_fkey"
    FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
