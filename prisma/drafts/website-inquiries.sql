-- NOT APPLIED: new inquiry object only. Existing Notification/User are reused without permission changes.
BEGIN;
CREATE TABLE public.website_inquiries (
 id uuid PRIMARY KEY,
 source_site text NOT NULL CHECK(source_site IN ('corporate','3pl','cs')),
 request_id uuid NOT NULL,
 payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 assigned_to text REFERENCES public."User"(id),
 received_at timestamptz NOT NULL,
 retention_until timestamptz NOT NULL CHECK(retention_until>received_at),
 record jsonb NOT NULL,
 UNIQUE(source_site,request_id),
 CHECK(record->>'id'=id::text),
 CHECK(record->>'source_site'=source_site),
 CHECK(record->>'request_id'=request_id::text),
 CHECK(record->>'hash'=payload_hash),
 CHECK((record->>'assignedTo') IS NOT DISTINCT FROM assigned_to)
);
CREATE INDEX website_inquiries_owner_recent ON public.website_inquiries(received_at DESC);
CREATE INDEX website_inquiries_assignee_recent ON public.website_inquiries(assigned_to,received_at DESC);
ALTER TABLE public.website_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_inquiries FROM PUBLIC, anon, authenticated;
CREATE TABLE public.website_inquiry_rate_limits (
 source_site text PRIMARY KEY CHECK(source_site IN ('corporate','3pl','cs')),
 window_start timestamptz NOT NULL,
 hits integer NOT NULL CHECK(hits BETWEEN 1 AND 1001)
);
ALTER TABLE public.website_inquiry_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_inquiry_rate_limits FROM PUBLIC, anon, authenticated;
-- No FORCE RLS, service_role change, broad grants, external push, or retention deletion.
ROLLBACK;
