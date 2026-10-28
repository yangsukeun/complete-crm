# OCR 내부 검수 최소 운영안 — 미적용

이 문서는 운영 적용 승인을 위한 구체안이다. SQL 초안은 모두 ROLLBACK으로 끝나며, 앱 런타임은 null로 비활성이다. ERP 호스트를 가정하거나 실제 재고 쓰기를 구현하지 않았다.

## 승인 대상

기존 CRM PostgreSQL에 아래 **새 테이블 4개와 인덱스**만 추가한다. 기존 User/거래처를 참조하며 기존 행·역할·데이터를 변경하지 않는다. 번호 시퀀스나 새 DB 역할은 만들지 않는다.

| 이름 | 저장 내용 | 접근 |
|---|---|---|
| `crm_ocr_devices` | 장치 ID, 허용 거래처, 등록/회수/만료, 토큰 SHA256 해시와 만료 | 기존 서버만. 사용자 화면/worker에 해시 반환 금지 |
| `crm_ocr_documents` | 거래처, 업로더/검수자, 원본 객체 참조·해시, revision, 내부 검수 기록 | 기존 CRM 인증 + 활성 물류 사용자 중 업로더/검수자, 또는 정확한 대표 ID |
| `crm_ocr_jobs` | 문서 revision별 작업·장치·lease·결과·receipt | 장치는 배정된 거래처/문서의 현재 lease만 |
| `crm_ocr_events` | 사용자/장치·행위·revision·요청키·이전/이후 상태·시간 | 서버 기록. 원문 사진/토큰을 감사 이벤트에 복사하지 않음 |

새 4개 테이블에 일반 RLS를 켜고 PUBLIC/anon/authenticated의 직접 접근만 차단한다. FORCE RLS나 service_role 회수, 기존 테이블 권한 변경은 없다. 서버 연결 역할이 표 소유자 또는 BYPASSRLS인지 적용 전에 재확인한다. SQL: `prisma/drafts/ocr-internal-review.sql`.

## 비공개 원본

- 새 버킷 **`crm-ocr-originals`**, public=false, JPG/PNG만, 파일당 8 MiB, 덮어쓰기 없음.
- 객체키 `{CRM거래처UUID}/{문서UUID}/original`은 서버 생성. 클라이언트 경로/URL 지정 금지.
- 브라우저 직접 접근 차단용 `storage.objects` restrictive 정책 4개: `crm_ocr_block_browser_select/insert/update/delete`. 새 버킷에만 제한을 추가하고 다른 버킷은 동일하게 유지한다. 기존 광역 허용 정책이 있어도 새 버킷에는 적용되지 않도록 한다. service_role 권한은 그대로 유지한다.
- 기존 서버 Storage 클라이언트를 주입한다. 새 키 생성 없음. 사용자/장치 다운로드는 서버가 최신 권한/lease를 검사한 뒤 bytes를 반환하며 공개·서명 URL을 제공하지 않는다.
- 기존 동일 이름 버킷이 있으면 자동 재사용/변경하지 않고 중지한다. 기존 정책 점검 후 적용한다. 초안: `prisma/drafts/ocr-private-storage-policy.sql`.
- 저장소 성공 후 DB 실패 시 참조 없는 비공개 객체가 남을 수 있다. 성공을 반환하지 않고 운영 점검 대상으로 남긴다. 자동 삭제/광역 정리 기능은 만들지 않았다.

## 장치 인증 — 별도 명시 승인 필요

- 파일럿 1대(승인할 실제 PC 및 Windows 사용자), 지정 거래처만, 등록 최대 7일. 짧은 bearer 토큰 최대 15분, lease 최대 10분 및 토큰/등록 만료 이내. 즉시 회수 가능.
- 권한은 POST claim, GET lease/image, POST result만. 사용자 일기·재무·급여·다른 거래처·원본 업로드·검수 승인·입고/재고 쓰기 없음.
- 검증기는 해시와 현재 등록/회수/만료/활성 거래처를 매번 검사한다. **발급/갱신/PC 저장 코드는 아직 활성화하지 않았으며 실제 인증을 생성하지 않았다.** PC 저장은 OCR 작업의 DPAPI CurrentUser 제안을 따르되 별도 승인 후 연결한다.
- 자동시작·서비스 설치·유료 호스팅·새 외부 AI 연결은 이번 안에 포함하지 않는다.

## CRM 내부 매핑과 실제 API

내부 `companyId`는 기존 `logistics_sales_records`의 활성 `kind=client` UUID를 사용하도록 확정한다. 이것은 **CRM OCR 큐의 거래처 범위**이며 외부 ERP company ID와 같다고 주장하지 않는다. ERP 매핑은 추후 별도 검증한다. 초기 검수자는 업로더 자신, 대표는 전체 검수 가능. 다른 직원 자동 공유/담당자 지정은 없다.

- `POST /api/logistics-ocr/reviews`: 세션+동일출처+크기/MIME/매직바이트 검사, 멱등 업로드.
- `GET /api/logistics-ocr/reviews/:id/read|original`: 현재 DB 사용자 권한 및 문서 범위 검사.
- `POST /api/logistics-ocr/reviews/:id/review|cancel|retry`: 최신 revision, 동일출처 및 멱등키 확인. reviewed는 CRM 내부 검수 저장만 뜻한다.
- `/api/3pl/ocr-worker/claim`, `/jobs/:id/lease|image|result`: OCR 담당 e980292 계약. 결과는 항상 needs_review/registrationAuthorized=false.
- 현재 모든 신규 경로는 런타임 미등록으로 503을 반환한다. 환경변수 하나로 켜지지 않는다. 승인된 DB·버킷·장치 인증의 실제 연결 검증 후 코드에서 명시적으로 연결해야 한다.

Postgres 어댑터는 기존 Prisma 연결과 트랜잭션 advisory lock으로 파일럿 작업을 직렬화한다. 결과 해시·lease/revision 일치 및 중복 receipt를 확인한다. 취소/회수/만료/재시도 후 옛 결과는 차단한다. retry는 새 revision을 만들고 원본과 이전 결과를 보존한다.

## 보유기간 제안 — 미적용

원본·OCR 후보 90일, 검수/감사 메타데이터 1년을 검토 제안한다. 사용자 확인 전 자동 보존/삭제 스케줄을 만들지 않고 `retention_until`은 null이다. 문의 5년 승인을 사진이나 인사 정보에 확대하지 않는다.

## 적용 및 복구 순서

1. 새 객체 미존재, 기존 서버 역할·Storage 클라이언트 사용 가능 여부, 기존 버킷 정책을 읽기로 확인.
2. 승인 후 새 객체/버킷/해당 버킷 제한 정책만 적용. 합성 검증은 별도 로컬 또는 승인된 롤백 트랜잭션으로 수행.
3. 장치 범위와 인증 발급/저장 승인 후 1대만 등록. 기존 세션 업로드→배정→결과→원본 검수 저장을 검증. 운영 재고 쓰기 없음.
4. 장애 시 런타임 비활성화/이전 코드로 복구하고 해당 파일럿 장치만 회수. 기존 데이터·테이블을 drop하거나 버킷을 공개로 돌리지 않는다. 신규 보관 데이터는 승인된 정리 전 보존.

## 아직 검증하지 못한 것

실제 PostgreSQL에서 이 새 DDL/어댑터 실행, Supabase 버킷 정책 적용, 실제 장치 인증/worker, 직원 로그인·사진 업로드 E2E, ERP 입고는 미실행이다. 합성 메모리 트랜잭션 테스트는 실제 PG 동시성 검증을 대체하지 않는다. 로컬 UI 접근 거절은 우회하지 않았다.

OCR 내부 저장 합성 6개 시나리오: 동시 업로드/중복키, 타 사용자 차단, 단일 배정/응답 유실 재시도, 후보 조회/인간 검수 저장, 장치 회수/취소/만료/새 revision, 저장 실패 롤백·비공개 잔여 객체, HTTP 인증/CSRF/잘못된 장치/원본 bytes 경계를 확인했다. 최종 타입·변경 파일 린트·전체 Next 빌드는 통과했다. 런타임 활성화·실제 PG 실행을 통과한 것은 아니다.

## 최소 승인 문구

“CRM OCR 내부 검수용 `crm_ocr_devices/documents/jobs/events` 네 테이블과 인덱스, 새 비공개 `crm-ocr-originals` 버킷 및 해당 새 객체/버킷의 브라우저 직접 접근 차단을 승인합니다. 기존 데이터·역할·service_role 권한은 유지합니다. 승인한 PC 1대와 거래처 범위에 한해 7일 등록·15분 토큰을 발급하고 DPAPI CurrentUser에 보관하며, 배정 사진 읽기와 OCR 후보 제출만 허용합니다. 실제 ERP 입고·재고 변경·자동시작·유료서비스는 제외합니다.”

PC/Windows 사용자·허용 거래처 목록은 등록 전에 정확히 특정해야 한다. 보유기간 제안은 이 문구와 별도로 확인한다.

설계 참고: [Supabase Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control), [PostgreSQL SELECT/행 잠금](https://www.postgresql.org/docs/current/sql-select.html). 실제 프로젝트의 기존 정책·역할 검증은 이 문서 확인과 별개다.
