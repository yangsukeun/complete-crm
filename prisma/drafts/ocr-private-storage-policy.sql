-- REVIEW ONLY. No bucket created or existing policy changed.
-- Proposed Storage API createBucket('crm-ocr-originals', {public:false,fileSizeLimit:8388608,allowedMimeTypes:['image/png','image/jpeg']}).
-- Stop if bucket already exists. Audit existing policies before applying this draft.
BEGIN;
CREATE POLICY crm_ocr_block_browser_select ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket_id<>'crm-ocr-originals');
CREATE POLICY crm_ocr_block_browser_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'crm-ocr-originals');
CREATE POLICY crm_ocr_block_browser_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'crm-ocr-originals') WITH CHECK(bucket_id<>'crm-ocr-originals');
CREATE POLICY crm_ocr_block_browser_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'crm-ocr-originals');
-- These restrictions exclude only the proposed bucket. No service_role or other bucket grant changes.
ROLLBACK;
