# 문의 저장·내부 알림 적용 확인 — 2026-10-28

범위: CRM 코드와 승인된 문의 저장 2개 테이블, 내부 알림 저장, 합성 검증. 외부 이메일/직원 메시지/푸시/배포/접수 인증 생성 없음.

## 실제 적용
- CRM Supabase vgelnrycivorwczdqpsu에서 동명 객체 부재를 확인한 뒤 website_inquiry_storage_internal_notifications 마이그레이션 성공.
- public.website_inquiries: 문의 JSON 원문·출처·요청 ID·담당자·수신 시각·5년 보유 만료 시각. (source_site,request_id) 고유성, 최근/담당자 인덱스.
- public.website_inquiry_rate_limits: 사이트별 고정 한 행 카운터. 연락처/IP 저장 없음.
- 새 2개 테이블만 일반 RLS와 PUBLIC/anon/authenticated 직접 접근 회수. 기존 User/Notification/역할/service_role 변경 없음.
- 담당 지정 미확인으로 NEW/미배정 유지. 활성 대표에게만 개인정보 없는 CRM 확인용 내부 알림을 같은 트랜잭션에서 저장. 실제 기기 수신이나 읽음으로 표시하지 않는다.
- 5년 retention_until을 계산하지만 자동 영구삭제는 구현/실행하지 않았다.

## 검증
- 기존 Notification의 사용자 정의 DB 트리거 0개 확인 후 시험. 운영 알림 전송 경로를 호출하지 않았다.
- 실제 PG 트랜잭션: 합성 문의+대표 내부 알림, JSON/해시 제약, 정확한 동일 (site,request_id) UNIQUE, 알림 FK 실패 시 문의까지 rollback, 61회 사이트 카운터, 소속 없는 조회 조건, anon/authenticated SET LOCAL ROLE 실제 직접 조회 거부 통과.
- 두 시험 트랜잭션 모두 ROLLBACK. 완료 후 문의 0행, 카운터 0행. 합성 알림도 커밋하지 않았다.
- 애플리케이션 합성 13 tests: 동시 8회/응답 유실 재시도 멱등성, 저장실패 복구, 비로그인/무관직원/비활성 차단, 위조 필드, 속도/크기/동의 검사, 복합 서비스 보존 및 CS 외부 메일 경계. 메일 테스트는 모의 어댑터만 사용.
- 실제 PG 검증은 SQL 트랜잭션 검증이며 실제 웹 인증/Prisma 전체 E2E 검증과 구분한다.

## 미활성
- getInquiryRuntime()은 null이며 웹 접수는 503 INTAKE_NOT_CONFIGURED로 닫혀 있다.
- 이번에는 접수 전용 인증 생성, 최종 고지 활성화, 홈페이지 폼 연결, 외부 이메일 어댑터, 운영 코드 배포를 하지 않는다.
- 기존 담당자 라우팅 미확정이므로 임의 직원에게 배정하지 않는다.
- 복구는 코드 비활성 유지/변경 원복으로 우선하며 기존 데이터나 새 테이블을 drop하지 않는다.

## 모바일 404 읽기 점검
운영 7d2ce98에서 /logistics, /logistics/purchases, /logistics/sales, /logistics/ocr, /logistics/ocr/device 및 /workspaces/[area] 존재. 헤더 3PL href는 /logistics, 카드 OCR href는 /logistics/ocr로 일치한다. 장치 화면은 대표 아닌 계정·비활성 계정에 notFound(), OCR 홈은 기존 대표/물류 권한 실패에 notFound()한다. 첨부만으로 경로 누락인지 권한 차단인지 결정 불가. 실제 URL 회신 전 운영 수정 없음.

## 2026-10-28 접수 runtime 연결 후 상태

- corporate runtime 코드가 Prisma 저장·내부 알림 및 사이트별 분당 60회 카운터와 연결됐다. 새 테이블 RLS/직접 접근 차단 준비 검사 실패 시 비활성이다.
- 인증값은 CRM에 저장하지 않고 SHA256/발급시각/만료시각만 받는다. 최대 7일, corporate POST 단일 경로만 허용하고 GET이나 다른 CRM 조회 권한은 없다. Origin도 정확히 일치해야 하지만 Origin만으로 인증하지 않는다.
- 설정 이름: CRM_WEBSITE_INTAKE_ENABLED, CRM_CORPORATE_INQUIRY_SHA256, CRM_CORPORATE_INQUIRY_ISSUED_AT, CRM_CORPORATE_INQUIRY_EXPIRES_AT, CRM_CORPORATE_INQUIRY_ORIGIN. 실제 생성·설정은 아직 0건이다. CRM Vercel에서 CRM_CORPORATE_INQUIRY 검색 결과 없음 확인(값 열람 없음).
- 동의 버전 corporate-inquiry-v1-20261028: 주식회사 컴플리트가 문의 상담/CRM 저장/내부 담당 확인 목적으로 이름·전화·이메일·회사·선택 서비스·본문·동의 버전/시각을 수집, CRM 5년 보관, 철회/삭제 요청 y.complete@bscomplete.com. 자동 파기·광고 동의·외부 이메일 발송은 포함하지 않는다. 홈페이지의 탭 임시저장 고지도 활성화 전에 반영해야 한다.
- 현재 확정받은 Origin은 p9ialwoyh 개별 배포 주소뿐이다. 새 코드 배포는 새 immutable 주소를 만들므로 최종 안정적 alias를 홈페이지 작업에서 확정해야 한다. 이를 다른 호스트로 임의 확장하지 않았다.
- 홈페이지 api/inquiries.mjs는 공유 allowRequest 어댑터와 sendToCRM이 없으면 기본 비활성. CRM의 site 전체 제한은 홈페이지 익명/IP 요청 제한을 대체하지 않는다. 어댑터 전달 시 Origin 고정 헤더, Bearer 서버전용, redirect:error, 15초 timeout을 모두 사용해야 한다.
- 확인한 환경에 Vercel CLI가 없다(PATH/CRM node_modules/홈페이지 node_modules/일반 global 설치 경로). 연결된 Vercel 관리 API 도구도 없다. 정상 Dashboard 접근은 가능하지만 새 인증 입력·저장에는 browser computer-use의 사용자 직접 입력 요구가 적용된다. 기존 Vercel 로그인 비밀/쿠키를 추출해 API 호출하지 않는다. 공식 WebMCP Open Vercel Plugin을 열었으나 호출 가능한 Vercel 도구는 추가되지 않았다.
- 인증값을 먼저 생성하거나 채팅·로그·평문 파일에 남기지 않았다. 최종 Origin/홈페이지 제한 어댑터/지원되는 서버 비밀 설정 경로가 준비되면 한 번만 생성·설정하고 합성 종단 확인을 진행한다. 현재 실제 접수·외부 이메일·배포는 미실행이다.
