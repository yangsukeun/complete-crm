-- CreateTable
CREATE TABLE IF NOT EXISTS "DriveFilePin" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DriveFilePin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DriveFilePin_userId_driveFileId_key" ON "DriveFilePin"("userId", "driveFileId");
CREATE INDEX IF NOT EXISTS "DriveFilePin_userId_createdAt_idx" ON "DriveFilePin"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "DriveFilePin_driveFileId_idx" ON "DriveFilePin"("driveFileId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "DriveFilePin" ADD CONSTRAINT "DriveFilePin_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DriveFilePin" ADD CONSTRAINT "DriveFilePin_driveFileId_fkey"
    FOREIGN KEY ("driveFileId") REFERENCES "DriveFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
