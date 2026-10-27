-- Applied through approved Supabase migration create_rua_private_commands_browser_restricted.
-- Record only; do NOT rerun when objects already exist.
CREATE TABLE public.rua_private_commands (
 sequence BIGSERIAL PRIMARY KEY, actor TEXT NOT NULL, request_key TEXT NOT NULL,
 body TEXT NOT NULL, at TEXT NOT NULL, UNIQUE(actor,request_key)
);
ALTER TABLE public.rua_private_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rua_private_commands FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.rua_private_commands_sequence_seq FROM PUBLIC,anon,authenticated;
-- service_role preserved, FORCE RLS not used, existing objects/default grants unchanged.
