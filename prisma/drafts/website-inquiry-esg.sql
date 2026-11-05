-- Bounded production migration: existing source validators only; no grants/RLS/data changes.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
ALTER TABLE public.website_inquiries DROP CONSTRAINT website_inquiries_source_site_check,
 ADD CONSTRAINT website_inquiries_source_site_check CHECK(source_site IN ('corporate','3pl','cs','esg'));
ALTER TABLE public.website_inquiry_rate_limits DROP CONSTRAINT website_inquiry_rate_limits_source_site_check,
 ADD CONSTRAINT website_inquiry_rate_limits_source_site_check CHECK(source_site IN ('corporate','3pl','cs','esg'));
COMMIT;
-- Roll back code/disable ESG first. Preserve ESG rows; never shrink CHECK while such rows exist.
