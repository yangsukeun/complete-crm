# Manual device token rotation — CRM contract

POST /api/logistics-ocr/devices/{id}/rotate
Owner session, same-origin, active owner and explicit RSA public fingerprint confirmation required.
Body: existing pairing descriptor (requestKey UUID, publicKey RSA3072 SPKI, challenge hex64, pairExpiresAt epoch milliseconds <=5 minutes, confirmedFingerprint SHA256 DER hex64), plus previousRequestKey UUID from the currently stored credential envelope.
No bearer in browser or response. Response: deviceId, companyId, state, requestKey, registrationExpiresAt, tokenExpiresAt, registrationAuthorized=false.

Fresh pairing key per manual rotation. Same request/pair/generation retries return the existing receipt without new issuance. Different request must match current previousRequestKey. Revoked, uncertain, pending, expired registration and live job leases reject. Job and issuer transactions share advisory lock (724803,1).
Atomic commit replaces old token hash and enters pending_delivery. No job authentication until ACK. RegisteredAt, expiresAt, device, company and owner remain unchanged. New expiry=min(now+15 minutes, original registration expiry). No migration required; rotation.previousRequestKey is stored in existing issuer_state JSON.

Existing POST /api/logistics-ocr/devices/{id}/delivery unchanged: signed receive/ack/fail, no Origin/cookies. RSA-PSS SHA256 salt32 frame is UTF-8 JSON.stringify of the array: crm-ocr-pair-v1, https://www.cpcrm.co.kr, deviceId, requestKey, challenge, action, digest. Cipher envelope AES256GCM and RSA-OAEP SHA256.
Decrypted payload adds previousRequestKey and preserves registeredAt/registrationExpiresAt, alongside requestKey and credential(version=1, origin, deviceId, companyId, syntheticOnly=true, issuedAt, expiresAt, token).
PC must compare previousRequestKey plus original registration timestamps against its DPAPI vault before replacement. Atomically replace only the matching existing vault, decrypt/readback, then signed ACK of ciphertext digest. Never delete/re-register or restore the old token as usable. ACK response loss retries ACK only; store failure sends signed fail once. Fail accepted only during current token window, not initial registration window. Failure/expiry may require manual inspection; no automatic recovery/renewal.

Errors: 400 malformed/expired pairing; 401 missing session; 403 wrong owner/scope/fingerprint/proof; 404 device missing; 409 stale generation/pending/disabled/live lease/request mismatch; 410 registration/delivery expired; 503 unavailable runtime/unexpected error. All responses private,no-store. Never log pairing request bodies, credentials, plaintext envelopes or tokens.

ERP coordination: existing mapping 4c01f7b2-6fbe-418b-aeae-f816f1ce48f0 revision1 -> revision2; ERP user 3f692dad-ced6-46d1-9e2b-085c091c7d72 (bscomplete2020@naver.com). Same customer 2ea7b4c7-df73-4098-b45f-f7e744c6d2e5, CRM company e0c563ba-919f-456d-a645-46c5f2b2ec70, approved image hash and server key. Expiry unchanged 2026-11-09T15:00:11.999Z. Coordinate deployment with parent; do not test during revision mismatch.

No actual production token rotation invoked during implementation. Native isolated PostgreSQL unavailable; synthetic service tests do not substitute for a production device E2E test. ERP DPAPI helper compatibility must be confirmed before actual issuance.

## Owner-only generation lookup
GET /api/logistics-ocr/devices/{id}/status uses the existing active owner session and fixed company/device scope. Response has ONLY previousRequestKey (current generation UUID), registeredAt, registrationExpiresAt, tokenExpiresAt (nullable), state. Times are epoch milliseconds. Private,no-store; cross-origin browser requests denied. No token/hash/key/ciphertext/audit/employee data. No write or token issuance. UI provides Current registration lookup. PC receives this public metadata through the owner; never share CRM session cookies with PC helper.
404=not registered; 401=not logged in; 403=wrong owner/company/device; 503=runtime unavailable. Existing state values active/pending_delivery/uncertain/revoked, expired when active token or registration expired. Expired token with valid registration may be manually rotated; expired registration cannot. Pending/uncertain/revoked are never a license to delete the vault or re-register.
PC restart ACK recovery must retain ephemeral pairing private key/request/challenge/digest and verified vault generation under DPAPI. Resume only the same ACK within pairing/token lifetime. This API does not expose a pairing private key or restore it. ERP owns the pending DPAPI restart implementation.
