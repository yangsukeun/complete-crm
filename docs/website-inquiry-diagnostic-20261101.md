# 문의 결과 미확인 읽기 진단

## 후속 확인: 최초 원인은 별도 프론트 결함
부모가 Chromium에서 홈페이지 this.send=fetch 메서드 호출의 Illegal invocation을 재현했고 최초 실패 시 POST가 0건임을 확인했다. 아래 advisory lock 문제는 최초 실패 원인이 아니라 다음 단계의 잠재 장애로 분리한다. 프론트 수정/동일 요청 재시도와 독립 검증하며 아직 CRM 수정은 배포하지 않는다.

## 실제 엔진 격리 검증 상태
현재 환경 PATH에서 PostgreSQL/psql/initdb/pg_ctl/Docker를 찾지 못했고 기본 PostgreSQL/Docker 설치 경로 및 pglite/pg 패키지도 확인되지 않았다. 서비스 목록 조회는 Service Control Manager 접근 실패로 중단했으며 우회하지 않았다.
실제 Prisma 엔진용 opt-in 테스트 tests/website-inquiry-prisma-isolated.test.ts를 준비했다. 명시적 CRM_ISOLATED_PG_TEST_URL만 사용하며 localhost/127.0.0.1/::1의 crm_inquiry_synthetic_test DB만 허용한다. 기본 DATABASE_URL로 대체하지 않는다. 테스트 중 임시 합성 테이블은 롤백한다. DB가 제공되지 않아 실제 재현은 미실행/skip이며 모의 테스트 성공으로 이를 대체하지 않는다.

## 05:11 재시도 후
부모가 실제 Vercel 로그에서 홈페이지→CRM POST의 503을 확인했다(05:11:19.159 UTC). 프론트 Illegal invocation과 별도 단계다. 이후 05:10~05:13 문의/관련 내부 알림 집계와 합성 표식 조회 모두 0건, 제한 카운터도 0행. 설정/schema 준비의 503 INTAKE_NOT_CONFIGURED와 어댑터의 503 STORAGE_UNAVAILABLE를 구분할 응답 code가 아직 필요하다. 이 환경에는 Vercel 로그 도구가 없어 부모 작업자의 안전한 로그 대조가 필요하다.
수정 코드의 전체 Next production build/타입/린트 통과. 합성 회귀 26개 통과, 실제 엔진 테스트 1개는 로컬 DB 부재로 skip. 운영 POST/DB 변경/배포는 하지 않음.

대상 시험: 2026-11-01 05:06:08 / 05:06:45 UTC. 추가 POST/문의/알림 생성 안 함.

## 확인
- CRM DB의 05:00~05:15 UTC website_inquiries 집계 0건, /website-inquiries 링크 Notification 집계 0건.
- 지정된 합성 표식으로 조회한 문의도 0건. 본문/연락처는 반환하지 않음.
- 요청 제한 테이블 현재 0행. intake_tables_ready=true. 이미 준비된 스키마/접근 차단을 다시 변경하지 않음.
- 전달받은 발급/만료는 정확히 7일이며 시험 시각은 기간 안에 있음. 실제 Vercel 환경값은 이 실행 환경에서 확인하지 못함. 키/해시 조회·생성 안 함.

## 코드상 원인 후보 및 로컬 수정
실제 PostgreSQL catalog에서 pg_advisory_xact_lock(integer,integer)의 반환형이 void임을 확인. 문의 저장과 preflight에서 이를 Prisma 5.22 $queryRaw로 그대로 반환하고 있음. Prisma 공식 raw-query 문서는 unsupported 타입을 지원 타입으로 cast할 것을 요구함.
두 쿼리 반환값만 ::text AS lock_result로 변경. 동일 잠금 번호/트랜잭션/중복방지/권한 유지. 잠금 제거/DB변경 없음.
이 문제는 preflight 카운터가 생기기 전에 실패하는 증상과 일치하는 후보이나 해당 운영 요청 로그의 오류코드/본문을 아직 확보하지 못해 확정 원인이라고 주장하지 않음.

## 배포 전 대조
브라우저 작업자는 05:06:08/05:06:45 UTC CRM POST 로그에서 HTTP status와 안전한 오류코드만 확인:
- 503 INTAKE_NOT_CONFIGURED: 설정/스키마 준비 단계
- 401 SITE_AUTH_REQUIRED: Origin/인증/시간 불일치
- 503 STORAGE_UNAVAILABLE: 제한/저장 어댑터 실행 실패 (void 역직렬화 P2010 여부)
- CRM 요청 자체 없음: 홈페이지 BFF 단계 확인
Authorization, 문의 본문, 키 원문/해시를 로그·대화에 옮기지 않음.

합성 테스트 26개 통과. 새 3개는 Prisma void 오류를 모형화한 어댑터 회귀 테스트이며 실제 Prisma DB 엔진 재현과 다름. 운영 배포/추가 발송은 하지 않았음. 기존 동일 요청 ID/payload는 그대로 유지하고 수정 후 부모와 프론트가 단 한 번의 동일 요청 재시도 시점을 조율해야 함.
