-- PaymentRequest: 여러 첨부(이미지/엑셀 등) URL 배열 지원
-- 기존 attachment(String?)는 레거시 호환으로 유지
ALTER TABLE "PaymentRequest"
ADD COLUMN IF NOT EXISTS "attachments" JSONB;

