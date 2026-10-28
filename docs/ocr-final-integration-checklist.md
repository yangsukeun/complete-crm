# OCR 최종 연결 점검 — 코드 준비와 운영 미실행 구분

## b0fc945 PC 계약 대조

`OCR_PC_PAIRING_HELPER.md`, `device-pc-client.ts`, `connect-ocr-device.ts`, worker HTTP 모듈을 읽었다. RSA3072 SPKI 지문, RSA-OAEP/SHA256 + AES256-GCM, RSA-PSS/SHA256 salt32 서명 프레임, 고정 origin/device/company, envelope 및 ACK 필드가 CRM과 일치한다. 회수 promise 1회/회수 후 ACK 차단/5분 pairing 만료 검사도 CRM 참조 클라이언트에 맞췄다. 프로토콜 파일의 15분 이내 fail 회수 규칙을 함께 전달해야 한다.

CRM에는 실제 비동기 runtime 연결을 구현했다. `getProductionOcrBundle()`이 기존 Prisma, 기존 서버 Supabase Storage, 기존 getAppSession, issuer와 OCR service를 조합한다. `CRM_OCR_PILOT_ENABLED=true`가 명시적으로 설정되고 기존 서버 service-role 설정/CRM DB 대상이 맞아야만 준비 검사를 시작한다. 익명 키로 대체하지 않는다. 이 설정은 현재 변경하지 않았다.

runtime은 매번 새 OCR 4테이블·issuer_state 열·브라우저 직접 접근 차단·서버 BYPASSRLS·Storage 제한 정책 4개·private 버킷·8MiB 이하·JPEG/PNG MIME를 읽기 확인하고 하나라도 실패하면 null/503으로 닫힌다. 키·연결 문자열·오류 원문을 출력하지 않는다. 발급만 단독 활성화하지 않는다. 정상 worker 요청은 기존 발급 토큰으로 새로 인증하고 만료/회수를 검사한다. 파일럿 사람 세션은 정확한 활성 대표 ID만 받는다.

대표 전용 합성 업로드 UI→저장 API→작업 큐→worker result→내부검수 저장 경로가 연결됐다. HTTP 파일럿 업로드는 JPG/PNG 최대3MiB로 제한(버킷의 최대8MiB와 구분). 파일 해시+문서 종류별 요청키를 sessionStorage에 보존하며 원본/연락처/파일명을 저장하지 않는다. 새로고침 후 같은 파일로 재시도해도 같은 키를 쓴다. 실제 고객/직원 원본은 파일럿 대상이 아니다. UI 실제 브라우저 검수는 기존 접근 차단으로 미실행이다.

## 적용 전/적용 순서 — 아직 실행하지 않음

1. 최신 원격/배포와 대상 CRM 프로젝트를 대조하고 분리 커밋 계획을 확정. 기존 대표 비공개 제한·문의 변경을 무심코 함께 배포하지 않는다.
2. 이미 적용된 OCR 네 테이블/인덱스/RLS와 Storage restrictive 4정책이 그대로인지 읽기 확인. 동명 객체를 덮어쓰지 않는다. 네 테이블의 합성 검증 롤백 후 0건 확인은 앞선 체크포인트의 증거이며 현재 재확인 필요.
3. `prisma/drafts/ocr-device-issuer-state.sql`의 **crm_ocr_devices.issuer_state JSONB 열 및 제약 1개**를 검토 후 적용. 아직 미적용이다. 새 테이블/기존 사용자·역할·service_role 변경은 없다. 기존 행을 active로 backfill하지 않는다.
4. 정상 Supabase Dashboard 로그인 후 `crm-ocr-originals` private/JPEG·PNG/8MiB 버킷 생성. 현재 로그인 대기이며 재시도하지 않았다. Storage 시스템 SQL 직접 수정 금지.
5. 기존 운영 서버의 Storage service-role 설정 존재와 프로젝트 일치를 정상 경로로 확인. 값 추출/복사/새 키 생성 없이 판단. 없으면 필요한 정상 연결을 별도로 확인한다.
6. 코드 배포 후 준비 조건이 충족되는 환경에서만 파일럿 플래그 활성화. 먼저 대표/비로그인/타직원 직접 URL·API 차단 및 버킷 직접 접근 차단을 검증.
7. YSK-PC1/USER에서 OCR 담당의 `connect-ocr-device.ts --connect-approved-pilot` 실행. 공개 descriptor만 대표 CRM 화면에 입력하여 지문 확인. 5분 내 DPAPI readback/ACK/활성 확인. 실제 token은 출력하지 않는다. 등록 7일/토큰 15분을 각각 확인.
8. 합성 업로드→실제 worker 1회 실행→결과 receipt→내부검수 저장/새로고침→회수 후 차단을 확인. ERP 입고는 수행하지 않는다. 결과 불확실 시 서버 상태부터 확인하고 새 발급/덮어쓰기하지 않는다.

## 남은 미구현/미검증을 구체적으로 구분

- **OCR 담당 결합 지점:** 확인한 `connect-ocr-device.ts`는 활성 확인 후 종료하며 worker를 실행하지 않는다. `test-ocr-worker-session.ts`는 모의 큐다. 기존 `createOcrWorkerHttp` + `runOcrWorkerOnce` + Windows provider에 `readIssuedDeviceCredential(expected)`로 매 호출 현재 토큰을 공급하는 실제 1회 실행 진입이 필요하다. 다른 저장소는 수정하지 않았다. 실행부가 다른 위치에 이미 있는지는 OCR 담당 확인 필요. 자동 상시 데몬/재발급은 요구하지 않는다.
- worker 계약의 claim/lease/image/result 필드·headers 및 `{current:true}`/resultDigest receipt는 CRM과 대조했다. 배포된 HTTPS 왕복, 실제 PG 동시성, 실제 DPAPI와 worker의 결합 검수는 아직 아니다.
- ERP의 user/customer/review 명시적 매핑 저장과 런타임 조회, 운영 050/051 여부, 담당자 최종확인·재고 트랜잭션의 실제 연결은 미완료. CRM 내부 reviewed를 ERP 입고완료로 바꾸지 않는다.
- 대표 자료 제한은 별도 로컬 변경이며 실제 로그인 UI·공개 첨부/DB 직접경로 검수가 남아 미배포다. 이번 파일럿이 해결하지 않는다.
- 문의 접수 전용 인증과 실제 CS 메일 발신 어댑터는 별도 승인/연결 대기다. OCR 키를 재사용하지 않는다.

복구는 파일럿 플래그 off → 신규 요청 차단 → 필요 시 해당 단일 장치 회수 → 이전 코드로 복귀 순서다. 기존 데이터·테이블·버킷 파일을 삭제하지 않는다. 토큰/파일 생성이 불확실하면 등록 상태 및 device.dat 존재부터 확인한다.

## 2026-10-28 로그인 확인 후 실제 적용 체크포인트
- 지원되는 검수 IAB에서 yangsukeun 계정과 CRM 프로젝트 vgelnrycivorwczdqpsu / main Production Storage 접근을 확인했다. 이전 로그인 대기는 해소됐다. 일반 Chrome 차단 경로는 사용하지 않았다.
- Dashboard 정상 생성으로 crm-ocr-originals 버킷을 만들었다. SQL 읽기 확인: public=false, file_size_limit=8388608, allowed_mime_types=[image/jpeg,image/png]. 다른 버킷은 변경하지 않았다.
- crm_ocr_device_pairing_state 마이그레이션 성공: 새 OCR devices 객체의 nullable issuer_state와 검사 제약만 추가했다. 기존 직원/다른 객체/역할/service_role 변경 없음.
- 적용 후 실제 PG 준비 검사: tables_ready=true, browser_denied=true, storage_boundary=true, devices=0. 장치 인증 발급, DPAPI 저장, 사진 업로드, 실제 ERP 입고는 아직 실행하지 않았다.
- 원격 main은 ff2c26078d41cecad31bd5a4762c202d09e25b93 그대로다. Vercel 성공 상태 URL은 https://vercel.com/yangsukeuns-projects/complete-crm/DkTMi2RX8yKmfEYyHKgDAamKDLuz . 검수 브라우저에서 이 프로젝트 설정에 접근 가능하며 SUPABASE_SERVICE_ROLE_KEY 이름이 존재함을 확인했다. 값은 열지 않았다. 실제 Production 범위/키 유효성/런타임 활성화는 아직 확인하지 않았다.
- 현재 브랜치는 OCR 외 대표 자료 제한과 홈페이지 문의 코드도 포함하므로 전체 브랜치를 운영에 푸시하지 않았다. OCR 배포 구성 분리 및 실제 서버 준비 확인 후 단일 장치 시험을 이어가야 한다.
- 아벤트 최신 CRM-HANDOFF-1028.md를 읽었다. Node24 단일 장기 실행 프로세스와 서버 전용 영구 저장소, 최신 회사/사용자 권한 공급자가 필수다. 기존 Vercel CRM 서버리스에 로컬 파일 경로를 연결한 상태가 아니다. 담당의 9개 엔진 합성 검증과 실제 CRM/실물 XLS/운영 검증을 구분한다.
- 복구는 파일럿 비활성 유지와 코드 원복을 우선한다. 데이터/버킷/테이블을 삭제하지 않는다. 현재 장치 0대로 회수할 실제 인증값은 없다.
