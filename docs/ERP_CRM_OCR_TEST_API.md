# ERP synthetic OCR queue contract — local only

Base: production `ce28dd2`; separate branch `fix/erp-ocr-test-bridge`. No deployment, migration, credential creation, mapping insertion or real stock operation.

## Implemented

- `POST https://www.cpcrm.co.kr/api/integrations/erp/ocr-test/jobs`
  JSON `{binding, imageBase64}`. Binding exactly matches ERP `crm-test-bridge.ts`: requestKey, erpUserId, erpCustomerId, mappingId, mappingRevision, companyId, sha256, kind (statement/box), mimeType (image/png or image/jpeg), syntheticOnly:true.
- `GET .../jobs/{jobId}?erpUserId=...&erpCustomerId=...&mappingId=...&mappingRevision=1`
- Both return the ERP strict `OcrTestJob` shape: jobId, original binding, status, revision, registrationAuthorized:false, observations. Only needs_review can contain observations. They are unreviewed candidates; the ERP bridge adds reviewed:false, confirmedQuantity:null, receiptAllowed:false. Raw image/object path/URL/device token is never returned.
- Same client/request UUID and identical binding return the existing job. Changed image/binding returns 409. Current mapping is rechecked even on retries and reads. Revoked/expired/ambiguous/non-synthetic mappings deny access. Body fields cannot grant identity or receipt permission.
- Local HTTP adapter supports real Request/Response parsing and service injection; tests exercise successful enqueue/read, not just 503. Production factory remains null because no authorized server verifier or durable mapping/queue binding exists yet. This is not a live connection.

## ERP transport adjustment

Current ERP bridge accepts 8 MiB. This initial JSON transport accepts **2 MiB decoded image**, maximum 3 MiB HTTP body, to remain below the previously confirmed Vercel 4.5 MB function request limit after base64 overhead. ERP must show the narrower limit before upload. Do not silently truncate/compress. Larger files require a separately designed private upload flow; do not turn off storage protection.

ERP `queue.enqueue(binding,image)` should send that JSON over HTTPS and validate the returned binding using its existing strict parser. `queue.read(jobId,scope)` maps to the GET above. On network loss preserve original requestKey/binding and re-read/retry; never make a new UUID for the same submission. Errors are JSON `{error:code}`, no internals: 401 authentication missing, 403 scope/mapping denial, 409 binding/revision conflict, 413 limits, 400 input/hash/signature invalid, 503 disabled/storage unavailable. A 503 is not an accepted job.

## Authentication — proposal, NOT provisioned

Reuse the prior asymmetric ERP server assertion design, not device credentials or browser cookies. ERP server verifies its own employee session and inbound permission. CRM verifier must validate trusted issuer `https://logistics-erp-mvp.vercel.app`, audience `https://www.cpcrm.co.kr`, scope `ocr.synthetic.submit-read`, exact client/user/customer, active enrollment, signature and maximum 60-second assertion expiry. Bind assertion to HTTP method/path/body digest and reject replayed assertion jti; a transport retry uses a fresh assertion with the same durable requestKey. The injected service principal must only come from this verifier, never request JSON. Existing export scope `ocr.review.export` must not be accepted here. No assertion generator/verifier keys or persistent identity have been created.

## Minimum remaining operational scope

1. Confirm actual ERP operator UUID, synthetic ERP customer UUID and corresponding existing synthetic CRM company UUID. Candidate email/manager role is not identity confirmation. No real customer mapping by name. Mapping also binds client ID, revision, expiry and explicit synthetic-only status; scope restricted to create/read test jobs.
2. Implement durable CRM adapter using existing private original bucket and OCR documents/jobs/events. Proposed additional private objects: `crm_ocr_erp_test_mappings` (explicit IDs/revision/expiry/active/syntheticOnly) and `crm_ocr_erp_test_bindings` (client+request UUID unique, binding/hash, document/job IDs, audit times). These are proposals, not DDL applied or permission approved. Existing export mapping objects may be reused only after their exact schema/approval is reconciled.
3. The transaction must lock mapping and unique request binding across processes; insert the private original reference, document, queued job, binding and event consistently. Do not call owner-only upload while impersonating the representative. Mapping-bound ERP actor attribution needs an explicit event representation. Storage failure rolls back the job; DB failure after object upload leaves an orphan requiring safe reconciliation. No automatic deletion is introduced.
4. Confirm new ERP-server identity/key storage, narrow scope and expiry/revocation separately from existing 7-day device registration/15-minute worker token. Proposed pilot enrollment: 7 days, immediate disable; no automatic renewal. Retention proposal reuses approved OCR photo/candidate 90 days and audit 1 year, without automatic destructive deletion. No global/service_role changes.
5. After approvals: isolated PostgreSQL uniqueness/concurrency/rollback tests, verifier signature/replay tests, authorized synthetic mapping, deployment disabled first, enable only after readiness, then one synthetic upload → existing separately enrolled Windows worker → candidate read. No ERP receipt/stock API. Roll back by disabling this runtime and revoking only the pilot server identity; retain records and old OCR endpoints, no DROP or broad permission changes.

## Verification limits

Validation on 2026-11-02: 32 CRM/service/HTTP/existing OCR/private-summary tests passed. An additional local peer test imported the actual ERP `crm-test-bridge.ts` from the provided checkout and called the new CRM HTTP adapter: submit, same-key retry, candidate read, strict binding parse, confirmedQuantity:null and receiptAllowed:false passed. It used memory transaction/auth fixtures, no network and no image recognition. The machine-specific peer harness is retained locally as `tests/erp-ocr-peer.local.test.ts.disabled`, not included in the portable commit. Typecheck, scoped ESLint and full Next production build passed. No live PostgreSQL or authenticated production execution was run.

Local serialized memory transaction tests demonstrate service/HTTP contracts, authorization, retries and failure behavior. They do not prove PostgreSQL locking, durable queue persistence, production HTTPS identity, device enrollment, real staff login or OCR recognition accuracy. Existing worker claim/image/result remains separate and unchanged. CS and private diary/Av​ent behavior are not modified.
