-- CreateTable
CREATE TABLE "LinkPreviewCache" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "image" TEXT,
    "siteName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkPreviewCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkPreviewCache_url_key" ON "LinkPreviewCache"("url");

-- CreateIndex
CREATE INDEX "LinkPreviewCache_url_idx" ON "LinkPreviewCache"("url");
