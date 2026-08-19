-- CreateTable
CREATE TABLE "CsOrgReport" (
    "userId" TEXT NOT NULL,
    "reportsToId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsOrgReport_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "CsOrgReport_reportsToId_idx" ON "CsOrgReport"("reportsToId");

-- AddForeignKey
ALTER TABLE "CsOrgReport" ADD CONSTRAINT "CsOrgReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsOrgReport" ADD CONSTRAINT "CsOrgReport_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
