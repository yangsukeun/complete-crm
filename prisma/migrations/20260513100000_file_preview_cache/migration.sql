-- CreateEnum
CREATE TYPE "PreviewType" AS ENUM ('INLINE_NATIVE', 'DRIVE_EMBED', 'CONVERTED_PDF', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('NONE', 'PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "FilePreviewCache" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "originalMime" TEXT NOT NULL,
    "previewType" "PreviewType" NOT NULL,
    "convertedDriveId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "conversionStatus" "ConversionStatus" NOT NULL DEFAULT 'NONE',
    "conversionError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilePreviewCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrivePreviewPermissionExpiry" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrivePreviewPermissionExpiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilePreviewCache_driveFileId_key" ON "FilePreviewCache"("driveFileId");

-- CreateIndex
CREATE INDEX "FilePreviewCache_driveFileId_idx" ON "FilePreviewCache"("driveFileId");

-- CreateIndex
CREATE INDEX "FilePreviewCache_conversionStatus_idx" ON "FilePreviewCache"("conversionStatus");

-- CreateIndex
CREATE INDEX "DrivePreviewPermissionExpiry_driveFileId_idx" ON "DrivePreviewPermissionExpiry"("driveFileId");

-- CreateIndex
CREATE INDEX "DrivePreviewPermissionExpiry_expiresAt_idx" ON "DrivePreviewPermissionExpiry"("expiresAt");
