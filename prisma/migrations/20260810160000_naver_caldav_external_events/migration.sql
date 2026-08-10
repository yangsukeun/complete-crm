-- 네이버 캘린더 읽기: CalDAV 계정 + 외부 일정 스냅샷(.ics 업로드)

CREATE TABLE IF NOT EXISTS "NaverCalDavAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "naverId" TEXT NOT NULL,
    "passwordCipher" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NaverCalDavAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NaverCalDavAccount_userId_key" ON "NaverCalDavAccount"("userId");
CREATE INDEX IF NOT EXISTS "NaverCalDavAccount_userId_idx" ON "NaverCalDavAccount"("userId");

DO $$ BEGIN
  ALTER TABLE "NaverCalDavAccount" ADD CONSTRAINT "NaverCalDavAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ExternalCalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalCalendarEvent_userId_source_uid_startTime_key" ON "ExternalCalendarEvent"("userId", "source", "uid", "startTime");
CREATE INDEX IF NOT EXISTS "ExternalCalendarEvent_userId_source_startTime_idx" ON "ExternalCalendarEvent"("userId", "source", "startTime");

DO $$ BEGIN
  ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
