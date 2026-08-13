-- CS 이석(화장실·흡연) 로그. endedAt NULL = 현재 부재중. 사용자당 열린 로그는 최대 1건.

DO $$ BEGIN
  CREATE TYPE "AwayType" AS ENUM ('BATHROOM', 'SMOKING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AwayLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AwayType" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AwayLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AwayLog_userId_startedAt_idx" ON "AwayLog"("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "AwayLog_endedAt_idx" ON "AwayLog"("endedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "AwayLog_userId_open_key"
  ON "AwayLog"("userId")
  WHERE "endedAt" IS NULL;

DO $$ BEGIN
  ALTER TABLE "AwayLog" ADD CONSTRAINT "AwayLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
