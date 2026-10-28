-- LOCAL DRAFT ONLY; NOT APPLIED. Extends only the already approved new OCR device object.
BEGIN;
ALTER TABLE public.crm_ocr_devices ADD COLUMN issuer_state jsonb;
ALTER TABLE public.crm_ocr_devices ADD CONSTRAINT crm_ocr_issuer_state_valid CHECK (
 issuer_state IS NULL OR (jsonb_typeof(issuer_state)='object' AND issuer_state->>'state' IN ('pending_delivery','active','uncertain','revoked') AND jsonb_typeof(issuer_state->'audit')='array')
);
-- Never backfill existing tokens to active. Null/pending/uncertain deny worker authentication.
-- No role/grant changes or new object; no device is registered here.
ROLLBACK;
