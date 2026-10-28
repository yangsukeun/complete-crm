# CRM 단일 발급 주체 ↔ OCR 장치 보관 계약

**최신 정정:** 서버 내부 callback은 Vercel→PC 전달 경로가 아니므로 아래의 callback 설명은 이전 설계 이력이다. 현재 구현/양측 wire 계약은 [OCR_DEVICE_PAIRING_PROTOCOL.md](./OCR_DEVICE_PAIRING_PROTOCOL.md)를 따른다. 대표가 PC 공개키를 확인한 뒤 PC outbound HTTPS 암호문 수령·서명 ACK로 활성화하며 서버가 DPAPI를 실행하지 않는다. 실제 운영 발급은 계속 미실행이다.

OCR 담당 7d5d29a의 `OCR_DEVICE_APPROVED_HANDOFF.md` 및 `device-vault.ts`를 읽어 대조했다. 직접 에이전트 메시지는 사용하지 않으며 부모를 통해 이 계약을 전달한다.

## 고정 파일럿 식별자 (등록 전 예약, 비밀 아님)

- PC: YSK-PC1, Windows USER 한 계정. 다른 PC/사용자 등록 금지.
- deviceId: `2eacd22d-537e-4fe5-9a0c-0f848aa5321d`
- companyId: `e0c563ba-919f-456d-a645-46c5f2b2ec70`
- origin: `https://www.cpcrm.co.kr`
- syntheticOnly: true. companyId는 OCR 새 테이블 내부 합성 네임스페이스이며 ERP customers.id 또는 실제 CRM 거래처가 아니다.
- 위 ID는 로컬 계약에서만 예약했다. DB 등록/인증 발급은 아직 없다. 기존 ID 충돌/다른 활성 장치/등록 기간을 다시 확인한 뒤 한 번만 등록한다.

## 기간과 전달

DB 등록 expires_at은 registered_at부터 최대 7일이다. **vault의 issuedAt/expiresAt은 현재 bearer 토큰의 기간(최대 15분)**으로 넣는다. 7일을 token expiresAt으로 넣지 않는다. DB token_expires_at과 동일하며 등록 만료를 넘지 않는다. lease는 그보다 짧은 최대10분이다.

`storeIssuedDeviceCredential({version:1,origin,deviceId,companyId,syntheticOnly:true,issuedAt,expiresAt,token}, expected)`에 인메모리로 전달한다. OCR helper는 DPAPI CurrentUser로 `%LOCALAPPDATA%/Complete/OcrWorker/device.dat`에 wx 저장한다. 경로 존재 여부만 확인했으며 현재 파일은 없다. 파일 내용/기존 비밀을 읽지 않았다.

토큰은 명령행/환경변수/임시 평문 파일/채팅/도구 출력에 넣지 않는다. 인메모리 및 자식 프로세스 stdin/stdout 내부 파이프로만 전달한다. 실제 호출은 helper의 고정 스크립트 경로·현재 사용자·등록 범위를 검증한 정상 실행 경로로 한 번만 수행한다. 저장 실패/결과 불확실 시 DB 상태와 파일 존재를 먼저 확인하며 재발급/덮어쓰기하지 않는다. 기존 파일이 있으면 중단한다. 갱신/교체 방식은 별도 구현·검증 전 자동 수행하지 않는다.

## API 상태를 구분

구현된 worker API: `POST /api/3pl/ocr-worker/claim`, `GET /api/3pl/ocr-worker/jobs/:id/lease|image`, `POST /api/3pl/ocr-worker/jobs/:id/result`. 아직 runtime=null이며 운영 서비스 완료가 아니다.

발급/회수 API는 **로컬 구현, 미배포/비활성**이다. `POST /api/logistics-ocr/devices/:id/issue|revoke`, body `{requestKey:UUID}`만 허용하며 기존 CRM 정확한 대표 세션+현재 활성 여부+same-origin 검사, 고정 device/company 검사를 수행한다. 일반 직원/이체담당/OCR bearer는 호출할 수 없다. 응답은 상태·만료 시각만 포함하며 토큰/해시는 포함하지 않는다. 실제 발급은 DB 해시/기간과 DPAPI 보관이 함께 확인된 후 완료로 표시해야 한다.

회수는 해당 장치 revoked_at을 설정하고 token_hash/token_issued_at/token_expires_at을 비워 즉시 접근을 차단한다. 진행 중 lease도 다음 원본 읽기/결과 제출에서 거부한다. 재고/입고/급여/다른 고객 접근은 없다. 이미 승인된 단일 PC 등록 범위이며 새 등록 대상 확대를 의미하지 않는다.

## 독립 구현 및 아직 미적용인 저장 변경

`ocr-device-issuer.ts`, `ocr-device-issuer-pg.ts`, `ocr-device-issuer-http.ts`에 발급/회수/멱등/감사 로직을 구현했다. 원자적으로 pending_delivery를 먼저 저장하고 DPAPI callback 성공 뒤 active로 전환한다. 전달 실패는 uncertain으로 두고 해시를 비운다. 전달 후 DB 실패로 pending이 남으면 자동 전달/발급을 재시도하지 않는다. 회수가 전달 중 경쟁하면 회수가 우선한다. 같은 requestKey는 기존 상태만 반환하며 다른 키의 덮어쓰기/재발급은 409다. 만료는 expired로 표시하고 자동 갱신하지 않는다.

DB 코드의 추가 요구는 **새 OCR 테이블 crm_ocr_devices의 issuer_state JSONB 열 1개와 형식 제약**이다. 상태·요청키·대표 actor/시각/작업 감사만 저장한다. 기존 crm_ocr_events는 document_id가 필수여서 가짜 문서를 만들어 장치 감사를 넣지 않는다. 초안 `prisma/drafts/ocr-device-issuer-state.sql`은 미적용 ROLLBACK이다. 기존 직원/다른 테이블/역할/권한 변경은 없다. NULL·pending_delivery·uncertain·revoked는 worker 인증과 lease 검사에서 차단하도록 PG 어댑터도 수정했다.

실제 운영 활성화 전에 이 열 적용과 기존 행 상태 확인, 동일 PC DPAPI callback의 정상 실행 경로를 연결해야 한다. Vercel 프로세스에서 Windows DPAPI를 실행할 수 있다고 가정하지 않는다. 현재 getDeviceIssuer()와 OCR runtime은 null이며 실제 토큰 생성/발급/파일 저장은 없다. callback 어댑터 없이 엔드포인트만 켜면 안 된다.

## 현재 실제 브라우저 확인

지원 브라우저 목록에는 이 작업의 내장 브라우저와 MCP Apps가 있고 Chrome 확장 브라우저는 없었다. 일반 Chrome 네이티브 창은 목록에 있으나 이전 URL 정책 거절 경로를 재시도하지 않았다.

내장 브라우저에서 `https://supabase.com/dashboard/project/vgelnrycivorwczdqpsu/storage/buckets`로 정상 이동한 결과 `/dashboard/sign-in?returnTo=.../storage/files` 로그인 화면이 표시됐다. 프로젝트 Storage 내용을 아직 열람하지 못했다. 이는 PC 전체의 로그인 부재나 사용자 권한 거절을 뜻하지 않는다. 해당 내장 브라우저의 Supabase 로그인이 필요한 대기 상태다. 탭은 다음 작업을 위해 유지했다.

버킷 생성과 장치 실제 발급은 미실행이다. 홈페이지 문의 전용 인증과 OCR 장치 인증은 별개이며 문의 인증은 사용자 답변 대기 상태다.
