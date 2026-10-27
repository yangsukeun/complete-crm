-- DRAFT ONLY: not applied. Affects only the new object. Existing tables and grants unchanged.
BEGIN;
CREATE TABLE public.rua_project_updates (
  request_key text PRIMARY KEY,
  actor_id text NOT NULL,
  source_id text NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  source_index integer NOT NULL CHECK (source_index >= 0),
  project_id text NOT NULL,
  body jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id, source_id, source_index)
);
ALTER TABLE public.rua_project_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rua_project_updates FROM PUBLIC, anon, authenticated;
-- No FORCE RLS and no service_role revoke. Server role must be verified before application.
-- Rollback application routing first; preserve this table and its evidence, do not DROP records.
COMMIT;
