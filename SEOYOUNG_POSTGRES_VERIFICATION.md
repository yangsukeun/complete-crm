# 서영 정산 실제 격리 PostgreSQL 검증 — 2026-11-04

이 결과는 `SEOYOUNG_DRAFT_PERSISTENCE.md`의 “격리 PostgreSQL 미실행” 상태를 대체한다. 운영 DB·배포·push·실고객 데이터·CS 실행 자원은 사용하지 않았다.

## 실행 환경과 출처

- CS 보고서에서 확인된 기존 `embedded-postgres@18.6.0-beta.19` 패키지를 읽기 재사용했다. 설치 출처는 공개 npm 패키지이며 CS 작업의 package-lock이 보존되어 있다. 이번 작업에서는 새 설치를 하지 않았다.
- 런타임 위치: `C:/Users/USER/Documents/Codex/2026-11-03/task-3/pg-verification/node_modules/embedded-postgres`.
- 서영 실행기: `scripts/verify-seoyoung-postgres.mjs` (첫 검증은 `../seoyoung-pg-verification/verify.mjs`). PostgreSQL 18.6, loopback `127.0.0.1:45449`, DB `seoyoung_isolated_verification`.
- 전용 데이터 경로 `../seoyoung-pg-verification/synthetic-cluster-02`. 기존 폴더 재사용을 거절한다. 첫 실패 클러스터도 증거로 보존했다. CS 클러스터/포트/원본 파일을 수정하거나 정지하지 않았다.
- 실행 승인 절차를 거친 도구에서 서버·클라이언트를 함께 실행했다. 방화벽·시스템 서비스·계정·보안 정책은 변경하지 않았다. 합성 DB 임시 인증값은 메모리에서만 전달하고 결과에 기록하지 않았다.

## 실제 발견 및 수정

첫 실행은 DDL 적용/롤백과 권한 검사를 통과했으나 저장 API가 503을 반환했다. Prisma `$queryRaw`가 `pg_advisory_xact_lock`의 `void` 반환을 역직렬화하지 못했다. 반환값을 `::text`로 바꾸고 UUID 요청 키 비교/삽입에 명시적 `::uuid`를 적용했다. 이 결함은 이전 메모리 모의 테스트로 발견되지 않았다. 변경은 서영 저장 모듈에만 적용했으며 기존 다른 CRM 모듈은 수정하지 않았다.

## 검증 결과

| 단계 | 실제 결과 |
|---|---|
| 기준 스키마 | 현재 Prisma 스키마를 오프라인 SQL로 변환 후 신규 합성 DB에 적용 |
| 정산 DDL 롤백 | BEGIN → 정산 테이블 생성 → ROLLBACK 후 테이블 없음 |
| 정산 migration 적용 | 원본 검토 SQL 적용 성공. SHA256 `f1d4c1eeb3719dccccb845c0e7f4df03cde79c977f8081c4fd65dba6ee7a2b2f` |
| RLS/직접 브라우저 역할 | 두 테이블 RLS 활성화. 합성 anon/authenticated 역할 SELECT/DELETE 모두 42501 거절 |
| HTTP + Prisma 저장 | 초안 저장 200, 실제 PostgreSQL 행·이력 보관 |
| 중복 | 같은 요청 재시도 200/한 번 반영. 동일 고객·월 새 생성 409 |
| 동시 수정 | 같은 버전의 두 HTTP 요청 결과 200 + 409 |
| 권한 | 익명 401, 다른 부서·비활성 사용자 조회/수정 403. 저장 후 부서 변경도 즉시 차단 |
| 고객 경계 | 다른 고객 요청/조회 범위 400. 서버 scope/customer 고정 |
| 검토 상태 | 미완료 검토 요청 409. 정상 검토 완료 보관 후 수정 저장 시 draft로 복귀·승인값 제거 |
| 원자성·실패 복구 | 테스트 전용 audit INSERT 실패 트리거에서 503, 초안 버전 5 보존. 트리거 제거 후 동일 요청 재시도로 버전 6 성공 |
| 프로세스 재시작 | HTTP/Prisma 테스트 프로세스 종료, PostgreSQL 정지 후 재시작. 저장 행 JSON 전체 동일 |
| 새 앱 프로세스 재열기 | 별도 새 Vitest/HTTP/Prisma 프로세스에서 버전 6·행 수량·감사 이력 6건 확인 |
| 최종 다운로드 | 실제 DB 재열기 결과로 XLSX 생성. 9월 첫 12시트 순서, 셀 값, 공급가/VAT 수식, B2:AG3 병합, F36 합계 연결 통과 |
| 데이터 롤백 | 합성 상태 변경 후 ROLLBACK으로 직전 데이터와 동일 |
| 격리 스키마 reversal | 합성 DB의 새 두 테이블만 제거, 기준 합성 User 행 그대로 보존. 운영 rollback 방안으로 사용 금지 |
| 종료 확인 | 최종 PostgreSQL 종료. 45449 리스너 0, 기록된 테스트 PID의 프로세스 없음. 남은 pid 파일은 실행 중 프로세스를 뜻하지 않음 |

결과 파일: `../seoyoung-pg-verification/results-02.txt`. 저장소 실행기 재검증 결과는 `results-03.txt`에 별도 보존한다.
통합 테스트: `tests/seoyoung-postgres.test.ts`의 write/read 두 시나리오를 각각 새 프로세스에서 실행했다. 명시 opt-in과 정확한 loopback DB명/포트가 아니면 실행하지 않는다.

재현: 승인된 기존 패키지 디렉터리를 `SEOYOUNG_PG_PACKAGE`로 지정한 뒤 `node scripts/verify-seoyoung-postgres.mjs 04`처럼 미사용 두 자리 실행 번호를 준다. 기본 결과 경로는 저장소 옆 `seoyoung-pg-verification`이며 `SEOYOUNG_PG_EVIDENCE_DIR`로 별도 작업 폴더를 지정할 수 있다. 자동 다운로드/설치, 기존 클러스터 덮어쓰기, 데이터 삭제는 하지 않는다.

회귀 검사는 27개 통과, opt-in 실제 DB 시나리오 2개는 별도 실행에서 통과했다. 일반 실행에서는 그 2개가 안전하게 skip된다. 전체 Next webpack 빌드 통과. 빌드와 동시 실행한 첫 tsc가 일시적으로 `.next/types` 재생성 파일을 찾지 못했으며, 빌드 종료 후 단독 tsc 재실행은 통과했다. 변경 범위 ESLint 통과.

## 검증 범위의 한계

- HTTP/API·Prisma·PostgreSQL은 실제였지만 **세션 신원은 테스트 fixture**다. 실제 직원 로그인부터 브라우저까지의 운영 세션 E2E라고 주장하지 않는다. 사용자 계정 상태/부서 검사는 실제 합성 User 테이블을 읽었다.
- 브라우저 새로고침·재열기 검증은 이전의 모의 HTTP UI 테스트이고, 이번 실제 DB 프로세스 재시작 검증과 구분한다.
- 테이블 소유자 역할로 서버 동작을 검증했다. 운영의 기존 DB 서버 역할/RLS 호환성은 적용 전에 별도 확인해야 한다. 자동 권한 확대 없음.
- 실제 45개 Excel 반입·대조, 9월 원본 상세 시트/픽셀 완전 일치, 운영 migration/배포는 여전히 미완료다.

다음 단계는 기존 제공 실자료의 정상 반입과 대조, 운영 DB 역할 확인 및 정확한 migration/배포 승인이다. 신규 자료 재제출이나 운영 DB 테스트는 선행 요구하지 않는다.
