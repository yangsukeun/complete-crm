-- REVIEW DRAFT: no startup migration, no registered deployment migration.
-- Apply only after exact approval and existing object/role preflight.
BEGIN;
CREATE TABLE public.crm_ocr_erp_test_clients (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 100), kid text NOT NULL UNIQUE,
 public_jwk jsonb NOT NULL CHECK(public_jwk->>'kty'='OKP' AND public_jwk->>'crv'='Ed25519' AND NOT (public_jwk ? 'd')),
 active boolean NOT NULL DEFAULT false, issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '7 days')
);
CREATE TABLE public.crm_ocr_erp_test_nonces (
 client_id text NOT NULL REFERENCES public.crm_ocr_erp_test_clients(id), jti uuid NOT NULL,

 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(client_id,jti)
);
CREATE INDEX crm_ocr_erp_test_nonce_expiry ON public.crm_ocr_erp_test_nonces(expires_at);
CREATE TABLE public.crm_ocr_erp_test_mappings (
 id uuid PRIMARY KEY, revision integer NOT NULL CHECK(revision>0),
 client_id text NOT NULL REFERENCES public.crm_ocr_erp_test_clients(id),
 erp_user_id uuid NOT NULL, erp_customer_id uuid NOT NULL, crm_company_id uuid NOT NULL,
 crm_custodian_id text NOT NULL REFERENCES public."User"(id),
 active boolean NOT NULL DEFAULT false, synthetic_only boolean NOT NULL DEFAULT true CHECK(synthetic_only),
 approved_sha256 text[] NOT NULL CHECK(cardinality(approved_sha256) BETWEEN 1 AND 10),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(crm_custodian_id='cmmitn4830000fc0jt8c1l2jf'),
 UNIQUE(client_id,erp_user_id,erp_customer_id)
);
CREATE TABLE public.crm_ocr_erp_test_bindings (
 client_id text NOT NULL REFERENCES public.crm_ocr_erp_test_clients(id), request_key uuid NOT NULL,
 mapping_id uuid NOT NULL REFERENCES public.crm_ocr_erp_test_mappings(id), mapping_revision integer NOT NULL,
 binding jsonb NOT NULL, document_id uuid NOT NULL UNIQUE REFERENCES public.crm_ocr_documents(id),
 job_id uuid NOT NULL UNIQUE REFERENCES public.crm_ocr_jobs(id),
 created_at timestamptz NOT NULL DEFAULT now(), retention_until timestamptz NOT NULL DEFAULT(now()+interval '1 year'),
 PRIMARY KEY(client_id,request_key), CHECK(binding->>'syntheticOnly'='true')
);
ALTER TABLE public.crm_ocr_erp_test_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ocr_erp_test_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ocr_erp_test_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ocr_erp_test_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_ocr_erp_test_clients,public.crm_ocr_erp_test_nonces,public.crm_ocr_erp_test_mappings,public.crm_ocr_erp_test_bindings FROM PUBLIC,anon,authenticated;
-- No FORCE RLS, service_role revocation, grants to staff, existing table alterations or key inserts.
ROLLBACK; -- deliberately non-applying; replace only in separately approved migration workflow
