-- Help center: articles, tours, release notes
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");
CREATE INDEX "HelpArticle_category_orderIndex_idx" ON "HelpArticle"("category", "orderIndex");

CREATE TABLE "HelpTourStep" (
    "id" TEXT NOT NULL,
    "tourKey" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "targetSelector" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "placement" TEXT NOT NULL DEFAULT 'bottom',
    "route" TEXT,

    CONSTRAINT "HelpTourStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HelpTourStep_tourKey_orderIndex_key" ON "HelpTourStep"("tourKey", "orderIndex");

CREATE TABLE "UserTourProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),

    CONSTRAINT "UserTourProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTourProgress_userId_tourKey_key" ON "UserTourProgress"("userId", "tourKey");
CREATE INDEX "UserTourProgress_userId_idx" ON "UserTourProgress"("userId");

ALTER TABLE "UserTourProgress" ADD CONSTRAINT "UserTourProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReleaseNote" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "ReleaseNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReleaseNote_releasedAt_idx" ON "ReleaseNote"("releasedAt");
