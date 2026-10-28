-- LOCAL DRAFT ONLY. Existing table extension, not applied. Requires coordinated runtime rollout.
BEGIN;
ALTER TABLE public.website_inquiry_rate_limits ADD COLUMN bucket_key text NOT NULL DEFAULT 'site';
ALTER TABLE public.website_inquiry_rate_limits ADD CONSTRAINT website_inquiry_bucket_key_valid CHECK (bucket_key IN ('site','preflight') OR bucket_key ~ '^subject:[0-9]{4}-[0-9]{2}-[0-9]{2}:[a-f0-9]{64}$');
ALTER TABLE public.website_inquiry_rate_limits DROP CONSTRAINT website_inquiry_rate_limits_pkey;
ALTER TABLE public.website_inquiry_rate_limits ADD PRIMARY KEY(source_site,bucket_key);
-- Existing site counters retain bucket_key='site'. No grants, credentials, or inquiry deletion.
ROLLBACK;
