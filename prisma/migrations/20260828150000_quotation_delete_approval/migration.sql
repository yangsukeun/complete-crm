-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUOTATION_DELETE';

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "deleteRequestedAt" TIMESTAMP(3);
ALTER TABLE "Quotation" ADD COLUMN "deleteRequestedById" TEXT;

CREATE INDEX "Quotation_deleteRequestedAt_idx" ON "Quotation"("deleteRequestedAt");
CREATE INDEX "Quotation_deleteRequestedById_idx" ON "Quotation"("deleteRequestedById");

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_deleteRequestedById_fkey" FOREIGN KEY ("deleteRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
