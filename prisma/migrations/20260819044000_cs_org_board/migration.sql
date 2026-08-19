-- AlterTable
ALTER TABLE "CsClient" ADD COLUMN IF NOT EXISTS "phase" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS "CsClient_phase_idx" ON "CsClient"("phase");

-- CreateTable
CREATE TABLE "CsClientAssignmentPeriod" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedOn" TEXT NOT NULL,
    "endedOn" TEXT,
    "roleLabel" TEXT NOT NULL,

    CONSTRAINT "CsClientAssignmentPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CsClientAssignmentPeriod_userId_startedOn_idx" ON "CsClientAssignmentPeriod"("userId", "startedOn");
CREATE INDEX "CsClientAssignmentPeriod_clientId_endedOn_idx" ON "CsClientAssignmentPeriod"("clientId", "endedOn");

ALTER TABLE "CsClientAssignmentPeriod" ADD CONSTRAINT "CsClientAssignmentPeriod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CsClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CsClientAssignmentPeriod" ADD CONSTRAINT "CsClientAssignmentPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CsClientAssignmentPeriod" ("id", "clientId", "userId", "startedOn", "endedOn", "roleLabel")
SELECT gen_random_uuid()::text, a."clientId", a."userId",
  COALESCE(NULLIF(c."startDate", ''), to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul'), 'YYYY-MM-DD')),
  NULL, a."roleLabel"
FROM "CsClientAssignment" a
JOIN "CsClient" c ON c."id" = a."clientId";

-- CreateTable
CREATE TABLE "CsOrgMemo" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "CsOrgMemo_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CsOrgMemo" ("id", "content") VALUES ('cs-org', '');

-- CreateTable
CREATE TABLE "CsOrgHire" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "joinDate" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsOrgHire_pkey" PRIMARY KEY ("id")
);
