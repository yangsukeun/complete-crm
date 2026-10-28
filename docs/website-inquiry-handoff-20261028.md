# 회사 홈페이지 문의 인계 — 2026-10-28

기존 `task-2/CRM-INQUIRY-CONTRACT.md` v1을 재사용한다. 운영 수신은 아직 비활성이다. 현재 CRM 로컬 코드에 HTTP 수신/Prisma 트랜잭션 어댑터/대표 확인 화면을 구현했으며 `complete-crm-local` 메모리 구현을 운영에 사용하지 않는다. 실제 POST/알림 시험은 하지 않았다.

## 홈페이지 담당에게 전달할 계약

- 브라우저 → 홈페이지 동일 출처 `POST /api/inquiries` → 홈페이지 서버 → CRM `POST https://www.cpcrm.co.kr/api/integrations/website-inquiries/v1` (예정 경로, 현재 사용 금지). CRM canonical host/리다이렉트 없는 실제 주소는 연결 검증 때 고정한다.
- 공개 브라우저가 CRM에 직접 POST하지 않는다. CORS 허용 Origin은 현재 등록되지 않았다. 홈페이지 BFF의 실제 운영 Origin은 홈페이지 담당이 확정해야 한다. `bscomplete.com`은 기존 계약의 후보이며 www/검토 도메인을 자동 허용하지 않는다.
- 서버 간 인증은 `corporate` 접수 전용으로만 제한해야 한다. 기존 사이트 자격증명/신뢰 연결 확인 전까지 비활성이다. Origin, 일반 CRM 쿠키, 클라이언트에서 보낸 source_site만으로 인증하지 않는다. 새 비밀 생성은 별도 범위를 확인한다.
- JSON 최대 16 KiB. `schema_version:"1"`, `request_id:UUID`, `source_site:"corporate"`, `consultation_type`, `contact:{name,phone,email,company}`, `original_message`, `consent:{accepted:true,version,accepted_at:ISO UTC}`.
- 서비스 코드: `marketing`, `design`, `customer_service`, `logistics`, `general`. UI 명칭만 번역하며 코드는 유지한다.
- 복합 선택 보존용 선택 필드 `selected_services`를 추가했다(같은 서비스 enum, 중복 없이 1~5개). 복수 선택이면 consultation_type=general, 단일이면 그 서비스 코드와 같아야 한다. 원문과 함께 저장·확인 화면에 표시한다. 복합 CS를 customer_service로 바꿔 외부 전달하지 않는다.
- 이름 2~80자, 전화 8~24자 및 숫자 최소 8자리, 유효 이메일 최대 254자, 회사 최대 100자, 문의 최대 2000자. 첨부/HTML/담당자/상태/추가 필드는 받지 않는다.
- `Idempotency-Key`는 `request_id`와 동일. 응답 유실·새로고침 재시도는 같은 키/같은 payload. 내용 수정 후 새 제출에만 새 키를 쓴다. 개인정보를 URL/분석 로그에 넣지 않는다.
- 동의 버전은 **미확정**. `DRAFT-*`는 운영 거부한다. 5년 보관은 사용자 지정 정책이며 법정 의무로 표시하지 않는다. 목적·수집항목·철회/삭제 접수 경로가 포함된 최종 문구를 홈페이지와 CRM에 같은 버전으로 고정해야 한다.

## 응답 의미

DB 커밋 확인 후 신규 201, 동일 키/동일 내용 재요청 200:

```json
{"schema_version":"1","mode":"production","request_id":"UUID","inquiry_id":"UUID","persisted":true,"duplicate":false,"notification_status":"queued"}
```

`queued`는 CRM 내부 알림 레코드가 저장된 상태만 뜻한다. 기기 수신/읽음/푸시 성공이 아니다. 라우팅 미설정은 `notification_status:"not_configured"`이며 문의는 미배정으로 대표 확인함에 남긴다. 원문·연락처·직원 이름은 공개 응답에 넣지 않는다.

오류: 400/422 입력·동의, 401/403 서버 인증, 409 동일 키 내용 충돌, 413 크기, 429 제한(`Retry-After`), 503 저장 불가. 네트워크 유실은 결과 불확실로 표시하고 같은 키로 제한 재시도한다. 일반 `success:true`나 HTTP 200만으로 접수 완료를 표시하지 않는다.

## 라우팅/시험/남은 구현

- 현재 검증된 corporate 담당자 지정 없음. 임의 직원·CS 전체에게 보내지 않는다. 합성 시험의 직원 수신자도 미지정이다. 대표 확인 경로를 기본으로 구현하되 실제 알림 생성 시험은 검증된 본인 범위로 제한한다.
- 기존 Notification 모델을 재사용해 문의 저장과 내부 알림 생성을 한 트랜잭션으로 처리하는 안이다. 기존 외부 푸시 함수는 접수 저장에서 호출하지 않는다.
- 사이트별 인증·허용 동의 버전·분산 요청 제한, 고유(source_site, request_id), payload hash, 5년 보관 시각, 대표/명시적 담당자만 읽는 저장 모델과 서버 검사가 필요하다. 3PL 공동 매출 테이블은 문의 원문 저장소로 재사용하지 않는다.
- 신규 객체와 해당 객체 접근 제한의 구체 DDL 및 기존 사이트 인증 재사용 가능 여부를 준비한 후 적용 범위를 보고한다. 접수/담당 알림 목표 자체는 이미 승인되었으므로 재승인 질문 대상이 아니다.
- 공개 폼은 실제 저장/중복/실패/권한 종단 검증 전 비활성 상태를 유지한다.

### 홈페이지 담당 확인 사항 갱신

부모가 확인한 현재 공개 Origin은 `https://complete-renewal-review-p9ialwoyh-completes-projects-652c4a87.vercel.app`이다. 홈페이지 BFF의 same-origin 검증은 이 값 한 개를 기준으로 하며 와일드카드나 새 DNS를 추가하지 않는다. 이는 CRM 서버 인증을 대체하지 않는다.

기존 CRM 소스에서 재사용 가능한 사이트별 인증/분산 rate-limit 연결은 확인되지 않았다. Vercel 로그인은 배포 관리 세션이며 홈페이지 서버에서 CRM으로 보내는 자격증명이 아니다. 기존 DB/Storage/관리 API 키를 문의 접수에 전용하지 않는다.

새 인증이 필요한 최소안: corporate 홈페이지 서버만 보유하는 무작위 접수 전용 Bearer 인증값 1개와 CRM 수신 서버의 SHA256 검증값, 파일럿 최대 7일. HTTPS의 정확한 `/api/integrations/website-inquiries/v1` POST만 허용, 조회/수정/직원 접근/Storage/다른 사이트 권한 없음. 브라우저 번들·응답·로그에 노출하지 않고 폐기/교체 가능해야 한다. `corporateInquiryAuthenticator`는 주입된 해시/기간으로 고정 시간 비교하며 쿠키/Origin을 인증으로 받지 않는다. 실제 발급·Vercel 환경 등록은 아직 하지 않았다. 해당 두 서버 설정과 신규 인증 발급 범위의 승인 확인이 필요하다. 기존 다른 키의 재사용을 승인받은 것으로 가정하지 않는다.

동의 버전 후보는 `corporate-inquiry-v1-20261028`이나 아직 allowlist에 등록하지 않았다. 실제 고지의 처리 주체/철회·삭제 접수 경로 확정 후 홈페이지와 CRM에 같은 버전을 배포한다. 합성 테스트의 TEST 버전은 운영 설정이 아니다.

## 로컬 구현 완료와 정확한 활성화 조건

- `website-inquiry.ts`: 엄격한 v1 검증, source/동의/키 검사, 해시 충돌 처리, 5년 시각, 미배정 및 대표 내부 알림을 단일 트랜잭션으로 처리. 원문으로 업무 실행하지 않는다.
- `website-inquiry-pg.ts`: 기존 Prisma 연결과 Notification 재사용. 전용 advisory lock + UNIQUE(source_site,request_id). 신규 직원 권한/외부 푸시 없음.
- `POST /api/integrations/website-inquiries/v1`: 16KiB 스트리밍 제한, 사이트 인증/공유 rate-limit 어댑터가 모두 준비되어야 동작. 현재 runtime=null로 503. Origin을 인증으로 사용하지 않는다.
- `GET /api/website-inquiries?id=UUID`, `/website-inquiries?id=UUID`: 기존 getAppSession 인증, DB의 현재 활성 사용자 검증, 대표 또는 해당 assigned_to만 목록/상세 조회. 미배정 대표 확인 경로 구현. 담당자 지정 UI/쓰기 API는 없고 임의 자동 배정하지 않는다.
- 신규 운영 객체는 `public.website_inquiries` 및 고유/최근/담당자 인덱스, `public.website_inquiry_rate_limits`이다. 후자는 사이트당 1행(최대 3행)의 분당 카운터만 저장하며 IP/문의 원문을 넣지 않는다. DDL 초안 `prisma/drafts/website-inquiries.sql`은 ROLLBACK으로 끝나며 **미적용**. 새 객체만 RLS 및 PUBLIC/anon/authenticated 차단, 기존 User/Notification 권한은 그대로 유지하는 범위다. 기존 승인된 OCR 테이블과 무관하다.
- 사이트 인증 재사용 가능 여부 미확인. 새 키/지속 인증이 필요하면 corporate 접수 POST 전용 범위를 별도로 확인한다. `allowInquirySite`는 PG 원자적 UPSERT로 인증된 사이트별 분당 60회 제한을 구현한다. 실제 공유 저장소와 연결 전이며 인메모리 제한을 운영 완료로 주장하지 않는다. 홈페이지 BFF의 비인증/IP 요청 제한도 별도로 필요하다.
- 복구: intake runtime 비활성/이전 코드로 복귀. 기존 문의/알림 삭제나 테이블 drop 없이 보존. 만료 시각만 저장하며 자동 삭제 없음.
- 합성 서비스/HTTP 테스트 8건 통과: 동시 8회·응답 유실 재시도 1건 저장/알림, 키 충돌, 알림 실패 전체 롤백, 비활성 대표, 위조/동의/권한/크기/요청 제한. 실제 PG/Storage/직원 기기 시험이 아니다.

## CS 이메일 전달 추가

사용자가 지정한 `cjhwoghd@gmail.com`으로 customer_service 단독 문의만 전달한다. general 복합 문의는 선택 서비스를 보존하고 CRM 미배정 대표 확인으로 남긴다. 기존 CRM 소스/package에서 nodemailer/Resend/SMTP/sendMail/sendEmail 발송 구현은 검색되지 않았다. 이는 운영 Vercel 비밀 설정 부재를 검증한 뜻은 아니다. 새 서비스 가입/키 발급은 하지 않았다.

`website-inquiry-mail.ts`와 PG claim/finish 어댑터는 새 공급자 없이 주입형으로 구현했다. 문의 record JSON 안에 queued/sending/accepted/uncertain 및 시도 ID를 보관하므로 추가 메일 테이블은 필요 없다. 원자적 claim 후 한 번만 전송하며 응답 유실/sending/uncertain을 자동 재전송하지 않는다. 공급자 접수 성공은 수신/읽음이 아니다. 본문은 회신 연락처·문의 본문·접수번호만 포함하고 다른 업무/개인 자료를 참조하지 않는다.

메일 전달 목적을 포함한 별도 확정 동의 버전 allowlist와 실제 승인된 회사 발송 어댑터가 모두 없으면 메일은 보내지 않는다. 기존 일반 동의 버전 문의를 사후 자동 전달하지 않는다. 현재 실제 발송 0건. 기존 회사 발신 서비스/발신자 연결을 확인해야 하며 신규 지속 인증·서비스 비용이 필요하면 해당 범위를 분리한다.
