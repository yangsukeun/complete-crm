-- DriveFile: 탐색기 동기화 루트 구분 (업로드 폴더와 분리)
ALTER TABLE "DriveFile" ADD COLUMN IF NOT EXISTS "rootId" TEXT;
CREATE INDEX IF NOT EXISTS "DriveFile_rootId_idx" ON "DriveFile"("rootId");
