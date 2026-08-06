-- DriveFile 탐색기 목록: rootId + parentId 복합 조회
CREATE INDEX IF NOT EXISTS "DriveFile_rootId_parentId_idx" ON "DriveFile"("rootId", "parentId");
