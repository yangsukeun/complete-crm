-- CreateTable
CREATE TABLE "UserDailyUploadUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDailyUploadUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserDailyUploadUsage_userId_dayKey_key" ON "UserDailyUploadUsage"("userId", "dayKey");

CREATE INDEX "UserDailyUploadUsage_userId_dayKey_idx" ON "UserDailyUploadUsage"("userId", "dayKey");

ALTER TABLE "UserDailyUploadUsage" ADD CONSTRAINT "UserDailyUploadUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
