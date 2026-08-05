-- CreateTable
CREATE TABLE "DriveFile" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveFolderId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" BIGINT,
    "webViewLink" TEXT,
    "webContentLink" TEXT,
    "thumbnailLink" TEXT,
    "parentId" TEXT,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'google_drive',
    "createdBy" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "driveModifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDriveFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostDriveFile" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostDriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriveFile_driveFileId_key" ON "DriveFile"("driveFileId");

-- CreateIndex
CREATE INDEX "DriveFile_parentId_idx" ON "DriveFile"("parentId");

-- CreateIndex
CREATE INDEX "DriveFile_driveFolderId_idx" ON "DriveFile"("driveFolderId");

-- CreateIndex
CREATE INDEX "DriveFile_isFolder_idx" ON "DriveFile"("isFolder");

-- CreateIndex
CREATE INDEX "DriveFile_source_idx" ON "DriveFile"("source");

-- CreateIndex
CREATE INDEX "DriveFile_createdBy_idx" ON "DriveFile"("createdBy");

-- CreateIndex
CREATE INDEX "ProjectDriveFile_projectId_idx" ON "ProjectDriveFile"("projectId");

-- CreateIndex
CREATE INDEX "ProjectDriveFile_fileId_idx" ON "ProjectDriveFile"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDriveFile_projectId_fileId_key" ON "ProjectDriveFile"("projectId", "fileId");

-- CreateIndex
CREATE INDEX "PostDriveFile_postId_idx" ON "PostDriveFile"("postId");

-- CreateIndex
CREATE INDEX "PostDriveFile_fileId_idx" ON "PostDriveFile"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "PostDriveFile_postId_fileId_key" ON "PostDriveFile"("postId", "fileId");

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DriveFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDriveFile" ADD CONSTRAINT "ProjectDriveFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDriveFile" ADD CONSTRAINT "ProjectDriveFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "DriveFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostDriveFile" ADD CONSTRAINT "PostDriveFile_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BoardPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostDriveFile" ADD CONSTRAINT "PostDriveFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "DriveFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;