# OCR 승인 적용 체크포인트 — 2026-10-28

이 문서는 앞선 `ocr-minimal-operating-approval.md`의 미적용/보관기간 제안 상태를 갱신한다.

## 실제 적용/확인

- CRM Supabase 프로젝트 `vgelnrycivorwczdqpsu`에 승인된 새 테이블 `crm_ocr_devices`, `crm_ocr_documents`, `crm_ocr_jobs`, `crm_ocr_events` 및 인덱스 적용. migration `20261028055142 crm_ocr_internal_review_pilot`.
- 새 테이블 일반 RLS, PUBLIC/anon/authenticated 직접 접근 제한. postgres 소유/BYPASSRLS 확인. FORCE RLS 및 service_role 변경 없음.
- `crm_ocr_private_bucket_browser_boundary` 적용: `storage.objects`의 `crm_ocr_block_browser_select/insert/update/delete`는 anon/authenticated에 한해 `crm-ocr-originals`만 차단하는 RESTRICTIVE 정책. 기존 다른 버킷/역할 변경 없음.
- 합성 네임스페이스는 새 OCR 객체 안에만 존재한다. `is_synthetic=true`, client_id=NULL. 공유 영업 거래처에 시험 행을 넣지 않는다. 실제 고객사는 현재 어댑터에서 비활성이다.
- 사진/후보 90일, 검수/감사 1년 만료 시각을 저장한다. 삭제 작업/스케줄러는 만들지 않았다.
- 실제 PG 트랜잭션 안에서 합성 장치/문서/작업/이벤트 제약, 중복, 과도한 토큰 기간, 입고 허가값 거부, 검수 저장 및 보관기간을 확인한 뒤 ROLLBACK했다. 이후 읽기 확인: 네 테이블 모두 0건.

## 미실행/차단

- `crm-ocr-originals` 버킷은 아직 존재하지 않음. 현재 연결 도구에 Storage 버킷 생성 API가 없고 이 실행 프로세스에 기존 서버 Storage 인증 클라이언트가 연결되어 있지 않다. SQL로 Storage 메타데이터를 조작하거나 비밀을 추출하는 우회는 하지 않았다. 기존 승인된 서버 Storage API 실행 경로가 필요하다. 새 승인 부족과 구분한다.
- 대표 PC 장치/토큰 발급, DPAPI 저장, 실제 원본 업로드, Windows OCR 결과 제출, 실제 로그인 UI E2E는 미실행. 테이블 생성은 동작 완료가 아니다. 신규 HTTP 런타임은 계속 비활성(503)이다.
- 기존 UI `ERR_NETWORK_ACCESS_DENIED`와 별도 worktree junction Access denied는 재시도하지 않았다.
- 실제 배포의 DB 역할은 사용자 제공 설정과 서버 역할/연결 집계로 대조한 것이며 Vercel 환경 비밀을 직접 열람한 검증은 아니다.
- 별도 ERP 후보는 `https://logistics-erp-mvp.vercel.app`, 저장소 `Complete2020/logistics-erp-mvp`. 부모의 기존 가이드/Production 대조 결과이며 여기서 로그인 이후 기능이나 고객사 매핑은 검증하지 않았다. CRM 내부 검수 이후 실제 ERP 입고/재고 쓰기는 이번 범위 밖이다.

## 복구/다음 검증

런타임 비활성 유지가 현재 복구 지점이다. 실패 시 신규 장치 회수/신규 경로 비활성화하며 기존 데이터나 새 테이블을 drop하지 않는다. 버킷은 생성 후 private/MIME/8MiB 제한을 검증하고, 합성 전용 장치 1대(최대 7일, 토큰 최대 15분)를 등록해 업로드→배정→결과→내부검수, 만료/회수/중복/다른 고객 차단을 검증해야 한다. 실제 재고 변동은 발생시키지 않는다.
