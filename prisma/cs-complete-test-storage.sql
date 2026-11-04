-- Additive TEST-only storage. No operating employee/leave table is altered.
CREATE TABLE "CsCompleteTestSource" (
  "id" TEXT PRIMARY KEY CHECK ("id" ~ '^[a-f0-9]{64}$'),
  "snapshot" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "CsCompleteTestState" (
  "id" TEXT PRIMARY KEY REFERENCES "CsCompleteTestSource"("id"),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "payload" JSONB NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "CsCompleteTestRevision" (
  "id" TEXT NOT NULL REFERENCES "CsCompleteTestSource"("id"),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "payload" JSONB NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("id", "version")
);
ALTER TABLE "CsCompleteTestSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CsCompleteTestState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CsCompleteTestRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CsCompleteTestSource", "CsCompleteTestState", "CsCompleteTestRevision" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "CsCompleteTestSource", "CsCompleteTestState", "CsCompleteTestRevision" FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "CsCompleteTestSource", "CsCompleteTestState", "CsCompleteTestRevision" FROM authenticated;
  END IF;
END $$;
CREATE FUNCTION cs_complete_test_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'CS TEST source and revision records are immutable'; END $$;
REVOKE ALL ON FUNCTION cs_complete_test_immutable() FROM PUBLIC;
CREATE TRIGGER cs_test_source_immutable BEFORE UPDATE OR DELETE ON "CsCompleteTestSource"
FOR EACH ROW EXECUTE FUNCTION cs_complete_test_immutable();
CREATE TRIGGER cs_test_revision_immutable BEFORE UPDATE OR DELETE ON "CsCompleteTestRevision"
FOR EACH ROW EXECUTE FUNCTION cs_complete_test_immutable();
