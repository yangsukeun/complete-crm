# ESG intake v1

POST https://www.cpcrm.co.kr/api/integrations/website-inquiries/v1
Server BFF only: Authorization Bearer, Origin exactly https://complete-esg-pilot.yangsukeun.chatgpt.site, application/json, Idempotency-Key equal to request_id.

JSON: schema_version "1", request_id UUID, source_site "esg", consultation_type "esg", esg_service "agency" | "software" | "both"; contact {company (1..100),name (2..80),email (valid, max254)}; original_message 1..2000; optional preferred_schedule max200; consent {accepted:true,version:"esg-inquiry-v1-20261105",accepted_at:UTC ISO}. Strings trimmed; unknown fields rejected. Phone and selected_services must not be submitted. Max UTF-8 body16KiB.

201 new/200 identical retry: {schema_version:"1",mode:"production",request_id,inquiry_id,persisted:true,duplicate,notification_status:"queued"|"not_configured"}. queued means CRM record only, not push receipt/read. 409 changed payload;401 authentication;422 validation;413 size;429 throttled (Retry-After60);503 configuration/storage. persisted:null/outcome:unknown means retry exactly the SAME UUID/body/consent timestamp. Never create a new UUID on timeout. No external mail.

Sites server-only variables: ESG_INQUIRY_TOKEN (secret), ESG_INQUIRY_ISSUED_AT, ESG_INQUIRY_EXPIRES_AT, ESG_INQUIRY_CONSENT_VERSION, ESG_INQUIRY_ENABLED. Optional URL constant must be the endpoint above. BFF must enforce same-origin browser calls, anonymous throttling and fail closed for missing/expired config; no token in browser bundle/responses/logs. ESG token permits intake POST only; X-Inquiry-Operation: rate-limit is the only allowed sub-operation, using the existing {day,subject_hash} preflight contract (5/10min per subject,60/min preflight). No inquiry is created by preflight. BFF computes a date/ESG-scoped HMAC-SHA256 of provider-verified CF-Connecting-IP, never sends/logs the raw IP and fails closed when unavailable. CRM site limit60/minute is additional to BFF abuse protection.

CRM Production: CRM_ESG_INQUIRY_ENABLED=true, CRM_ESG_INQUIRY_ORIGIN as above, CRM_ESG_INQUIRY_SHA256 (lowercase64hex, sensitive), CRM_ESG_INQUIRY_ISSUED_AT / EXPIRES_AT UTC ISO. Exactly90*86400000ms lifetime. No automatic generation/renewal. Disable ESG flag to revoke immediately after applying runtime deployment. Corporate config untouched.

Storage: existing website_inquiries JSON preserves ESG service and schedule;5-year retention_until, no automatic deletion job. Owner-only read and single minimal owner notification; no staff assignment or CS mail. Existing RLS/grants unchanged. Only two source_site CHECK constraints need esg added.

Rollout: inspect existing constraints, extend their allowed source values, deploy backward-compatible CRM code with ESG disabled; configure distinct credential securely in both server runtimes; apply each runtime revision; test one synthetic inquiry and identical retry, verify one stored inquiry and owner notification. Site remains private until owner handles publication. Rollback: disable ESG and deploy prior CRM version, preserve any stored rows; do not restore old CHECK while ESG rows exist or delete data.
