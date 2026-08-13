DO $$ BEGIN
  CREATE TYPE "CsLoungePostType" AS ENUM ('NOTICE', 'LOUNGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CsLoungeVoteValue" AS ENUM ('LIKE', 'DISLIKE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CsLoungePost" (
  "id" TEXT NOT NULL,
  "type" "CsLoungePostType" NOT NULL,
  "content" TEXT NOT NULL,
  "nickname" TEXT,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,
  CONSTRAINT "CsLoungePost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CsLoungePost_type_createdAt_idx" ON "CsLoungePost"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "CsLoungePost_deletedAt_idx" ON "CsLoungePost"("deletedAt");

CREATE TABLE IF NOT EXISTS "CsLoungeVote" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "value" "CsLoungeVoteValue" NOT NULL,
  CONSTRAINT "CsLoungeVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CsLoungeVote_postId_userId_key" ON "CsLoungeVote"("postId", "userId");
CREATE INDEX IF NOT EXISTS "CsLoungeVote_postId_idx" ON "CsLoungeVote"("postId");

CREATE TABLE IF NOT EXISTS "CsClient" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TEXT,
  "endDate" TEXT,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CsClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CsClient_name_key" ON "CsClient"("name");
CREATE INDEX IF NOT EXISTS "CsClient_isActive_name_idx" ON "CsClient"("isActive", "name");
CREATE INDEX IF NOT EXISTS "CsClient_deletedAt_idx" ON "CsClient"("deletedAt");

CREATE TABLE IF NOT EXISTS "CsClientAssignment" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleLabel" TEXT NOT NULL,
  CONSTRAINT "CsClientAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CsClientAssignment_clientId_userId_key" ON "CsClientAssignment"("clientId", "userId");
CREATE INDEX IF NOT EXISTS "CsClientAssignment_userId_idx" ON "CsClientAssignment"("userId");

DO $$ BEGIN
  ALTER TABLE "CsLoungePost" ADD CONSTRAINT "CsLoungePost_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CsLoungePost" ADD CONSTRAINT "CsLoungePost_deletedBy_fkey"
    FOREIGN KEY ("deletedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CsLoungeVote" ADD CONSTRAINT "CsLoungeVote_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "CsLoungePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CsLoungeVote" ADD CONSTRAINT "CsLoungeVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CsClient" ADD CONSTRAINT "CsClient_updatedBy_fkey"
    FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CsClientAssignment" ADD CONSTRAINT "CsClientAssignment_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "CsClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CsClientAssignment" ADD CONSTRAINT "CsClientAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
