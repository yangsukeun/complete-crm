-- Naver Calendar OAuth + iCal feed token
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "icalFeedToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_icalFeedToken_key" ON "User"("icalFeedToken");

CREATE TABLE IF NOT EXISTS "NaverCalendarIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NaverCalendarIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NaverCalendarIntegration_userId_key" ON "NaverCalendarIntegration"("userId");
CREATE INDEX IF NOT EXISTS "NaverCalendarIntegration_userId_idx" ON "NaverCalendarIntegration"("userId");

DO $$ BEGIN
  ALTER TABLE "NaverCalendarIntegration" ADD CONSTRAINT "NaverCalendarIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
