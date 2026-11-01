# bscomplete.com 문의 연결 로컬 준비 — 운영 미적용

작업 위치: crm-security-deploy, 브랜치 work/website-intake-storage (기준 3fffd12).
이번 변경은 로컬 파일과 합성 테스트만이다. DB/환경변수/인증값/배포/실제 POST/알림/메일 변경 없음.

## 변경
- candidate Origin을 https://bscomplete.com 하나로 고정. www, http, 옛 검토 URL, 경로/후행 슬래시는 허용하지 않는다. 실제 BFF 환경값이 일치하지 않으면 비활성이다. 서버 간 Bearer 인증도 별도로 필요하다.
- runtime은 새 bucket_key 컬럼뿐 아니라 NOT NULL·기본값 site·(source_site,bucket_key) PK까지 검사하고 불일치 시 닫힌다.
- 일반 저장 오류는 persisted:null/outcome:unknown으로 응답. 결과 불확실이면 같은 request_id와 같은 payload로 재시도하며 새 키를 만들지 않는다. 입력/인증/충돌 등 확정 거부는 persisted:false/outcome:rejected.
- BFF 재사용용 confirmedInquiryReceipt(status, body, requestId) 추가. schema/mode/ID/UUID/persisted/duplicate/notification_status를 검사한다. 201 신규·200 중복 외에는 성공 표시하지 않는다.
- preflight 클라이언트는 persisted:false인 제한 응답만 허용. Content-Length 없는 응답도 스트림 1KiB 초과 시 중단한다. 제한 성공은 문의 저장이 아니다.
- 기존 트랜잭션·UNIQUE·advisory lock 방식 유지. 문의와 대표 내부 알림은 같이 저장하며 중복 접수에 두 번째 알림을 만들지 않는다.

## 홈페이지 연결 계약
POST https://www.cpcrm.co.kr/api/integrations/website-inquiries/v1
브라우저는 홈페이지 /api/inquiries만 호출한다. BFF는 고정 Origin, 서버 전용 Bearer, Content-Type:application/json, Idempotency-Key:request_id를 사용한다. redirect:error, timeout, 응답 크기 제한 필요.
선행 제한 호출은 같은 주소에 X-Inquiry-Operation:rate-limit와 {day,subject_hash}만 전송한다. 본 접수에는 해당 헤더를 붙이지 않는다. subject_hash는 신뢰된 호스팅 IP에서 서버 HMAC으로 생성하며 임의 브라우저 X-Forwarded-For를 믿지 않는다.
일반 요청은 기존 docs/website-inquiry-handoff-20261028.md v1 필드 유지. 복수 selected_services는 general, CS 단독만 customer_service. 프런트가 매 재시도마다 accepted_at을 갱신하면 payload 충돌하므로 최초 제출 payload 전체를 재사용해야 한다.
queued는 내부 알림 레코드 저장만 뜻한다. 미배정이며 대표 확인함 /website-inquiries 에서 확인. 실제 직원 기기 수신/읽음/이메일 전송은 포함하지 않는다.

## 5년 보관 근거와 고지
2026-10-26 06:34 UTC 안내의 3번은 “3PL·CS·회사 홈페이지 → CRM 문의 통합”이었다. 사용자가 06:37 UTC Sentinel_542c20e2b0c88191aedf6c5859b6a2e4에서 “3.보유기간5년, 저장소는 우리 CRM”으로 답했다. 회사 홈페이지에도 적용되는 사용자 지정 보관정책으로 확인됐으므로 보유기간을 재질문하지 않는다. 법정 의무 5년이라는 뜻은 아니다.
기존 동의 버전 corporate-inquiry-v1-20261028을 재사용하되 실제 홈페이지 고지가 동일한지 배포 전에 대조한다. 주식회사 컴플리트, 문의 상담/CRM 저장/내부 담당 확인, 이름·전화·이메일·회사·선택 서비스·본문·동의 버전/시각, 5년 보관, 철회/삭제 요청 y.complete@bscomplete.com. 자동 파기 미구현, 광고 동의 포함 안 함. 기존 필수 전화+이메일 수집 규칙 유지; 최소수집 변경은 별도 결정이다.
CS 외부 메일 목적은 이 일반 고지에 포함되지 않는다. 메일 어댑터 및 해당 목적 동의 버전 없이 전송하지 않는다.

### 만료/삭제 상태
현재 retention_until은 접수 시각에서 5년 후로 저장한다. 문의 만료 배치·관리 화면·자동 파기·백업 정리 기능은 없다. 카운터의 한 시간 지난 행 정리는 스팸 제한 메타데이터만 대상으로 하며 문의 파기를 대체하지 않는다.
운영에는 만료 대상 확인(내용 없이 ID/만료 시각), 보존 예외가 있는지 검토, 문의 JSON 개인정보 및 연결 알림/내보내기/별도 메일 사본·백업 정책 점검, 삭제 승인·결과 감사가 필요하다. 회사가 별도로 보존해야 할 사유를 임의로 추정하거나 무기한 보유로 바꾸지 않는다. DB 백업까지 즉시 삭제된다고 표시하지 않는다.
이번에는 만료 삭제 SQL/스케줄을 실행하거나 자동 삭제 기능을 활성화하지 않았다. 고지에는 5년 보유와 삭제 요청 연락처만 기재하고 “자동 파기 완료/구현”으로 표현하지 않는다. 실수집 활성화 전에 만료 처리 책임자와 검토/삭제 절차를 확정해야 한다.

## 최소 운영 변경안 — 현재 모두 실행 금지/승인 대기
1. 기존 public.website_inquiry_rate_limits에 bucket_key text NOT NULL DEFAULT 'site', 허용키 CHECK, PK(source_site,bucket_key) 변경. 기존 site 카운터 유지. 신규 테이블·직원 권한·다른 객체 권한 변경 없음. prisma/drafts/website-inquiry-subject-limits.sql은 ROLLBACK 초안 그대로 미적용.
2. 홈페이지 최종 Origin https://bscomplete.com 및 신뢰 IP 공급자 대조 후, CRM 문의 관련 커밋만 현재 main 위에 분리 적용·배포. 이 준비 브랜치 전체를 그대로 main으로 밀지 않는다. 비밀번호/재무/OCR/폴더 변경 제외.
3. 별도 승인된 정상 수단으로 corporate 접수 전용 최대7일 인증을 홈페이지 서버에, SHA256/발급·만료/Origin/enable 값을 CRM 서버에 설정. 브라우저·로그·문서 노출 금지. 현재 생성·조회·설정 안 함. 만료 이후 자동 영구연장하지 않는다.
4. 합성 표시한 1개 문의로 앞단 제한→저장→대표 내부 알림→동일 키 재시도→대표 확인 경로 종단검증. 실제 알림 생성은 운영 검증 승인 후에만. 다른 직원 발송/외부 이메일 제외.
5. 실패 시 intake flag off와 BFF 폼 비활성. 문의·알림·카운터를 삭제하거나 테이블 DROP하지 않는다. PK 복구는 추가 bucket 행과 코드 의존성 검토 후 별도 절차.

## 검증 한계
23개 합성 테스트 통과: 중복/동시/응답 유실, 알림 저장 실패 롤백, 동일 키 충돌, 권한, 입력, 동의, 속도제한, Origin, 준비 안 된 스키마, 위조 접수 응답.
실제 PostgreSQL 확장·동시성, 실제 메일/브라우저/HTTP 연결·배포는 이번에 수행하지 않았다. 모의 runtime readiness 테스트는 실제 DDL 실행 검증이 아니다.
