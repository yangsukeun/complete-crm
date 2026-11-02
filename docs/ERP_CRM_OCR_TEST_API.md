# ERP → CRM 합성 OCR 서버 계약과 운영 적용안

작성일 2026-11-02. 운영 기준 ce28dd2에서 분리한 로컬 작업이다. 실제 키·매핑·DB·배포 변경은 수행하지 않았다.

## 구현한 경로

- POST https://www.cpcrm.co.kr/api/integrations/erp/ocr-test/jobs
- GET /api/integrations/erp/ocr-test/jobs/{jobId}?erpUserId={UUID}&erpCustomerId={UUID}&mappingId={UUID}&mappingRevision=1
- POST JSON: `{binding,imageBase64}`. binding 필드: requestKey, erpUserId, erpCustomerId, mappingId, mappingRevision, companyId, sha256, kind(statement/box), mimeType(image/png 또는 image/jpeg), syntheticOnly:true.
- 응답은 ERP OcrTestJob 계약 그대로 jobId/binding/status/revision/registrationAuthorized:false/observations. needs_review의 observations만 미검수 후보로 제공한다. 사진 URL·장치 토큰·입고 허가는 반환하지 않는다.
- 디코딩 이미지 최대 2 MiB, HTTP 본문 최대 3 MiB. 기존 ERP의 8 MiB 입력 제한을 이 경로에서는 2 MiB로 맞춰야 한다. 묵시적 압축·자르기는 하지 않는다.
- 동일 client/requestKey 및 동일 binding은 기존 작업 반환. 다른 binding은409. 재시도·조회에도 현재 매핑·등록·만료·고객사를 검사한다.

## 서버 인증: 구현 완료, 등록 미실행

Ed25519 compact JWS를 Authorization Bearer로 보낸다. 브라우저 쿠키나 PC 장치 토큰을 재사용하지 않는다. ERP 서버는 자신의 로그인·입고 권한을 먼저 확인해야 한다.

헤더: `{alg:"EdDSA",typ:"erp-ocr-test+jwt",kid:"등록된 공개키 식별자"}`.
페이로드: `{iss:"https://logistics-erp-mvp.vercel.app",aud:"https://www.cpcrm.co.kr",sub:"등록된 client ID",scope:"ocr.synthetic.submit-read",erpUserId:"확인된 UUID",erpCustomerId:"확인된 합성 UUID",iat:초단위시각,exp:iat+60,jti:"매번 새 UUID",method:"POST",target:"/api/integrations/erp/ocr-test/jobs",bodySha256:"전송할 UTF-8 본문의 SHA256 소문자 hex"}`.
GET은 빈 본문 SHA256을 사용하고 target에 실제 query 순서/인코딩까지 포함한다. JSON을 서명 후 다시 직렬화하지 않는다. 전송 재시도는 새 jti/서명과 기존 requestKey/동일 본문을 사용한다. 60초 초과·미래발급·등록 전 발급·만료·철회·다른 키·변조는 차단한다. nonce는 PG에서 원자적으로 소비한다.

오류 `{error:code}`: 인증401, 매핑/고객사403, revision/중복내용409, 보관만료410, 크기413, 입력400, 비활성/저장실패503. 응답 유실은 성공으로 표시하지 않고 같은 requestKey로 확인한다.

## 영속 저장과 기본 차단

CRM_ERP_OCR_TEST_ENABLED가 정확히 true이고 새4테이블의 RLS/브라우저 권한, 기존 OCR 런타임·비공개 저장소가 준비되어야 활성화된다. 시작 시 마이그레이션·키 발급·매핑 삽입은 없다. PgTestAuthStore/PgTestQueueStore가 실제 Prisma 트랜잭션을 사용한다.

기존 큐와 동일 advisory lock을 사용하며 두 기존 PG 어댑터의 void 반환을 ::text로 바꾼다. 문서·큐·binding·이력은 같은 DB 트랜잭션에 저장한다. Storage와 PG는 하나의 원자적 트랜잭션이 아니므로 업로드 후 DB 실패 시 비공개 고아 객체가 남을 수 있다. 재시도는 결정적 object key의 길이/해시가 정확히 일치할 때만 재사용하고 덮어쓰기·자동삭제하지 않는다.

## 한 번에 검토할 정확한 운영 변경 범위

1. 새 테이블4개: crm_ocr_erp_test_clients(공개키/등록), crm_ocr_erp_test_nonces(재사용 방지), crm_ocr_erp_test_mappings(명시적 사용자·고객사 매핑), crm_ocr_erp_test_bindings(멱등키·문서/작업 연결). PK/unique/FK 및 nonce 만료 인덱스, 새 객체만 RLS와 PUBLIC/anon/authenticated 직접 접근 차단. 기존 역할/service_role/기존 테이블 보안은 변경하지 않는다. 초안 prisma/drafts/erp-ocr-test-persistence.sql은 ROLLBACK으로 끝나며 미적용이다.
2. ERP 서버 전용 Ed25519 키1쌍을 승인된 서버 설정 경로로 생성·등록: 개인키는 ERP 서버에만, CRM은 공개 JWK와 kid/client ID만 보관. 파일럿 등록 최대7일·요청 서명 최대60초. 자동갱신 없음. 폐기는 client.active=false, 매핑 active=false로 즉시 차단. PC 장치 인증과 별개다. 키/서명은 로그·채팅·브라우저 응답에 넣지 않는다.
3. 확인된 ERP 담당자 UUID + 합성 ERP 고객사 UUID + 합성 CRM company UUID + 매핑 revision/만료와 사전 승인된 합성 이미지 SHA256 목록(최대10개)을 등록. 목록 밖 사진은 syntheticOnly 표시와 무관하게 서버에서 거부한다. 후보 이메일만으로 확정하지 않는다. 기존 실고객사로 대체하지 않는다. 현재 문서 모델은 대표 custodian으로 업로드/검수 소유자를 기록하고 실제 ERP 작성자·고객사를 binding에 남기는 설계다. 이 귀속 방식도 승인 범위에 명시해야 하며 대표가 직접 업로드한 것으로 설명하지 않는다. 새 직원 열람 권한은 없다.
4. 기존 crm-ocr-originals 비공개 버킷을 재사용한다. 신규 버킷/공개 URL/사진 외부서비스 전송 없음. 사진·후보90일, binding/감사1년 기준, 만료 후 접근 차단. 실제 자동 영구삭제는 미구현이며 별도 안전 절차가 필요하다. nonce 정리도 자동 실행하지 않는다.
5. 기존 승인 PC1대의 등록 상태·공개키 지문·합성 고객사 범위를 확인한다. 이미 유효한 등록은 재발급하지 않는다. 필요한 경우 기존 승인 범위의 7일 장치 등록/15분 토큰/DPAPI CurrentUser 저장을 정상 발급 절차로 수행한다. 서버 키와 장치 키를 공유하지 않는다.
6. CRM/ERP 코드 배포는 처음 비활성으로 진행, 기존 로그인·대표 일기·아벤트 회귀 확인 후 확인된 매핑만 활성화. 합성 사진1건→큐 배정→PC OCR→미검수 후보 조회 및 같은 requestKey 재시도로 검증한다. 실제 재고·입고확정·실고객 데이터는 제외한다.
7. 복구: feature flag false, 해당 client/매핑 비활성화, 직전 배포 복구. 기존 데이터/새 테이블 DROP·사진 일괄삭제·전체 권한 회수 없음. 개인키 폐기는 ERP 설정 경로에서 수행한다.

## 검증 범위와 남은 조건

서명·replay·변조·만료·철회, 서비스/HTTP·멱등·다른 고객사·실패의 합성 테스트를 구현했다. 기존 실제 ERP crm-test-bridge.ts를 가져오는 로컬 계약 시험은 생성/재시도/조회/엄격 응답 파싱 및 receiptAllowed:false를 확인했다. 추가 계약 시험에서는 실제 Ed25519 서명 검증기까지 연결해 통과했다. 공개키 등록/nonce 저장과 큐 저장은 합성 어댑터이며 운영 HTTPS나 PG 통합 완료가 아니다. 회귀 53건 통과, 실제 ERP 브리지 추가 계약 시험 1건 통과(공유 fixture의 기존 16건도 재실행), 격리 PG 1건은 SKIP이다. 타입 검사와 변경 파일 ESLint는 통과했다.

실제 Prisma+격리 PG 테스트 tests/erp-ocr-test-pg-isolated.test.ts도 작성했다. CRM_ISOLATED_PG_TEST_URL은 기존에 준비된 loopback의 crm_inquiry_synthetic_test DB만 허용하고 운영 DATABASE_URL로 대체하지 않는다. 현재 변수·PostgreSQL/Docker 설치가 확인되지 않아 실행은 SKIP이다. PostgreSQL 동시성·롤백·실제 DDL 호환성은 아직 미검증이다. 승인 후에도 이 검증과 정확한 담당자/합성고객사 매핑 확인을 먼저 마쳐야 한다.

## ERP 작업자 인계 설정 이름(제안, 미설정)

ERP 서버 측 CRM_OCR_TEST_CLIENT_ID / CRM_OCR_TEST_KEY_ID / CRM_OCR_TEST_PRIVATE_JWK는 위 client/kid/Ed25519 개인 JWK에 대응한다. NEXT_PUBLIC 접두사 사용 금지. CRM은 개인키 환경변수를 받지 않고 clients 테이블 공개 JWK만 검증한다. 서버 URL은 위 HTTPS 원본으로 고정한다. ERP 담당은 자신의 로그인 세션에서 실제 actor/customer 권한을 얻어 서명해야 하며 브라우저의 임의 actor 값을 신뢰하면 안 된다. CRM 쪽 활성화 변수는 CRM_ERP_OCR_TEST_ENABLED 하나다. 기존 OCR 환경변수·스토리지 자격증명은 재사용 가능 여부를 정상 메타데이터로만 점검하고 값을 추출/복사하지 않는다.

이 로컬 변경에는 ERP 서버의 실제 서명 발급 어댑터 배포가 포함되지 않는다. 양쪽 코드 배포와 실제 서명 HTTPS/PG 검증은 다음 운영 단계에서 함께 확인해야 한다. 단순 enabled 조회나 합성 메모리 시험만으로 실제 연결 성공을 선언하지 않는다.

보관 정책 제안의 추가 구분: nonce는 요청 만료 후 24시간, 공개키 등록/매핑 메타데이터는 등록 만료·회수 후 1년 보관을 제안한다. 현재 DDL의 expires_at은 접근/인증 만료 시각이며 자동 삭제 시각이 아니다. 이 로컬 구현에는 정리 스케줄러가 없으므로 실제 파기 완료로 안내하면 안 된다. 위 정책의 정리 실행은 보존 대상과 감사 의존성을 확인하는 별도 안전 검수 후 적용한다.

## 확인된 담당자(운영 매핑 삽입 아님)

2026-11-02 사용자 직접 답변 Sentinel_6bc0106601208191b03ae5df409a7b4b로 ERP 테스트 담당자 compelte2020@naver.com이 확정되었다. ERP 사용자 ID는 149e3fa6-eee5-4c78-abeb-f7f49e018dd8이다. 이 ID만 명시 매핑 계약의 erpUserId로 사용한다. 승인된 합성 ERP 고객사 UUID, 대응 CRM 합성 company UUID, 공개키 client/kid, 매핑 UUID/revision/기간, 승인 합성 이미지 해시는 아직 미설정이다. 기존 실고객사나 fixture UUID로 대체하지 않는다. 이 확인은 키 생성·운영 DB/권한·배포 승인이 아니다.

최종 검증: 합성 회귀53건 PASS, 실제 ERP 브리지와 Ed25519 검증기 계약1건 PASS(공유16건 재실행 포함17건), 타입 검사 및 변경 파일 ESLint PASS. 최종 Webpack 전체 production build PASS. 최초 Turbopack 빌드는 약9분 compile 정체로 중단했으며, Webpack 첫 시도의 로컬 .next EPERM은 정상 실행 심사를 통해 해소했다. 임시 next.config.ts 수정은 원복했다. 격리 PostgreSQL 테스트1건은 환경 부재로 SKIP, 실제 HTTPS/Storage/PC OCR/운영 검증은 미실행이다.

## 2026-11-02 읽기 전용 사전 확인 보완

CRM 프로젝트 vgelnrycivorwczdqpsu의 정상 Supabase 연결에서 최소 SELECT로 확인했다. company_id=e0c563ba-919f-456d-a645-46c5f2b2ec70의 crm_ocr_devices는 0건, crm_ocr_documents는 0건, 같은 id의 logistics_sales_records도 0건이다. 사진·인증 해시/토큰·개인정보는 조회하지 않았다.

src/lib/ocr-device-issuer.ts의 OCR_PILOT 및 기존 장치 계약은 이 ID를 syntheticOnly=true인 OCR 큐 합성 네임스페이스로 지정한다. 실제 CRM 거래처나 ERP customers.id로 등록된 회사가 아니다. 따라서 CRM 측 파일럿 companyId 후보로 재사용할 근거는 있으나, 이미 운영 등록·장치 활성화가 끝났다는 근거는 없다. 합성 범위 장치 등록과 명시 매핑을 정상 승인 절차로 완료해야 한다.

ERP 작업의 고객사 읽기 확인에서 합성 고객사가 없다면 ERP 합성 고객사 1개(실제 거래·연락처·재고 없음)의 생성과 그 실제 발급 UUID 연결을 운영 승인 묶음에 포함한다. CRM UUID를 ERP 고객사 ID로 복사하거나 실고객을 대신 사용하지 않는다. 담당자는 이미 확인된 149e3fa6-eee5-4c78-abeb-f7f49e018dd8로 한정하며 다시 확인을 요구하지 않는다.

ERP 작업이 이전에 사용한 PostgreSQL14 격리 회귀 환경은 부모가 확인 중이다. 이 작업에서 PATH/기본 설치경로에 없었던 사실을 PC 전체에 PostgreSQL이 없다는 뜻으로 확대하지 않는다. 실행 도구 경로·격리 DB 이름·접속 설정 전달 방식·기존 DB와 분리된 시험 스키마 사용 권한을 확인받은 후 테스트의 loopback 전용 가드를 유지하면서 연결한다. 운영 연결문자열이나 ERP 운영 DB로 대체하지 않는다. 아직 PG 시험 실행 결과는 SKIP 상태다.
