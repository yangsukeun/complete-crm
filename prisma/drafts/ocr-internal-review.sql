-- REVIEW DRAFT ONLY. Not a registered migration; NEVER applied by application startup.
-- CRM internal review only. No ERP inventory objects, no credential issuance.
BEGIN;
CREATE TABLE public.crm_ocr_devices (
 id UUID PRIMARY KEY, company_id UUID NOT NULL,
 client_id TEXT REFERENCES public.logistics_sales_records(id) ON DELETE RESTRICT,
 is_synthetic BOOLEAN NOT NULL DEFAULT true,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 registered_by TEXT NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 registered_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ, token_hash TEXT UNIQUE, token_issued_at TIMESTAMPTZ, token_expires_at TIMESTAMPTZ,
 CHECK((is_synthetic AND client_id IS NULL) OR (NOT is_synthetic AND client_id=company_id::text)), CHECK(expires_at>registered_at AND expires_at<=registered_at+interval '7 days'),
 CHECK((token_hash IS NULL AND token_issued_at IS NULL AND token_expires_at IS NULL) OR
 (token_hash IS NOT NULL AND token_hash ~ '^[a-f0-9]{64}$' AND token_issued_at IS NOT NULL AND token_expires_at IS NOT NULL AND token_expires_at>token_issued_at AND token_expires_at<=token_issued_at+interval '15 minutes' AND token_expires_at<=expires_at))
);
CREATE TABLE public.crm_ocr_documents (
 id UUID PRIMARY KEY, company_id UUID NOT NULL,
 client_id TEXT REFERENCES public.logistics_sales_records(id) ON DELETE RESTRICT,
 is_synthetic BOOLEAN NOT NULL DEFAULT true,
 uploader_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 reviewer_id TEXT NOT NULL REFERENCES public."User"(id) ON DELETE RESTRICT,
 request_key UUID NOT NULL, request_hash TEXT NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 kind TEXT NOT NULL CHECK(kind IN ('statement','box')),
 object_key TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg')),
 byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 8388608),
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','needs_review','reviewed','cancelled')),
 review JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 retention_until TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '90 days'),
 review_retention_until TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '1 year'), CHECK((is_synthetic AND client_id IS NULL) OR (NOT is_synthetic AND client_id=company_id::text)), UNIQUE(uploader_id,request_key),
 CHECK(object_key=company_id::text||'/'||id::text||'/original'),
 CHECK(review IS NULL OR jsonb_typeof(review)='object')
);
CREATE TABLE public.crm_ocr_jobs (
 id UUID PRIMARY KEY, document_id UUID NOT NULL REFERENCES public.crm_ocr_documents(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>0),
 device_id UUID REFERENCES public.crm_ocr_devices(id) ON DELETE RESTRICT,
 lease_id UUID UNIQUE, lease_expires_at TIMESTAMPTZ,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','needs_review','cancelled')),
 result_digest TEXT CHECK(result_digest ~ '^[a-f0-9]{64}$'), result JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), result_retention_until TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '90 days'), UNIQUE(document_id,revision),
 CHECK((lease_id IS NULL AND device_id IS NULL AND lease_expires_at IS NULL) OR (lease_id IS NOT NULL AND device_id IS NOT NULL AND lease_expires_at IS NOT NULL)),
 CHECK((result_digest IS NULL AND result IS NULL) OR (result_digest IS NOT NULL AND result IS NOT NULL AND result->>'status'='needs_review' AND result->>'registrationAuthorized'='false'))
);
CREATE TABLE public.crm_ocr_events (
 id UUID PRIMARY KEY, document_id UUID NOT NULL REFERENCES public.crm_ocr_documents(id) ON DELETE RESTRICT,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','device')), actor_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('upload','claim','result','review','cancel','retry')),
 revision INTEGER NOT NULL CHECK(revision>0), request_key TEXT NOT NULL,
 before_state TEXT, after_state TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), retention_until TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '1 year'),
 UNIQUE(document_id,action,request_key)
);
CREATE INDEX crm_ocr_documents_scope ON public.crm_ocr_documents(company_id,uploader_id,reviewer_id,created_at);
CREATE INDEX crm_ocr_jobs_pending ON public.crm_ocr_jobs(created_at,id) WHERE state='queued';
CREATE INDEX crm_ocr_events_document ON public.crm_ocr_events(document_id,created_at);
ALTER TABLE public.crm_ocr_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ocr_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ocr_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ocr_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_ocr_devices,public.crm_ocr_documents,public.crm_ocr_jobs,public.crm_ocr_events FROM PUBLIC,anon,authenticated;
-- No FORCE RLS, no service_role revoke, no existing object/role changes, no public functions.
-- Bucket crm-ocr-originals is a separate proposed Storage API operation, NOT performed here.
ROLLBACK; -- Deliberately non-applying review draft. Approval + preflight required for a real migration.
