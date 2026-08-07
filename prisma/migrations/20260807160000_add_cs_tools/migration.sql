-- CreateTable
CREATE TABLE "CsTool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsToolClickLog" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsToolClickLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CsTool_isActive_order_idx" ON "CsTool"("isActive", "order");

-- CreateIndex
CREATE INDEX "CsTool_category_idx" ON "CsTool"("category");

-- CreateIndex
CREATE INDEX "CsToolClickLog_toolId_clickedAt_idx" ON "CsToolClickLog"("toolId", "clickedAt");

-- CreateIndex
CREATE INDEX "CsToolClickLog_userId_clickedAt_idx" ON "CsToolClickLog"("userId", "clickedAt");

-- AddForeignKey
ALTER TABLE "CsToolClickLog" ADD CONSTRAINT "CsToolClickLog_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "CsTool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsToolClickLog" ADD CONSTRAINT "CsToolClickLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
