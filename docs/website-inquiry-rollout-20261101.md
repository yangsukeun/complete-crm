# 승인 후 운영 진행 상태

2026-11-01 사용자 전부승인 증거에 따라 진행. 이전 초안 문서의 미적용 상태보다 이 기록이 최신이다.

- website_inquiry_subject_limits 마이그레이션 성공. 기존 website_inquiry_rate_limits에 bucket_key/검사제약/복합 PK 적용. RLS 및 anon/authenticated 차단 유지 확인. 카운터 합성 UPSERT는 트랜잭션 롤백.
- 일지 수정은 bd56ca3 별도 커밋과 첫 main 푸시로 분리. 문의는 기존 세 커밋을 cherry-pick한 뒤 bscomplete.com 보완 커밋으로 분리한다. 역할/재무/폴더/비밀번호 변경 없음.
- 회귀 63 tests, tsc, 변경 린트 통과. 실제 인증 문의 발송은 아직 하지 않음.

## 미실행 설정 / 부모 인계
현재 실행 환경의 도구 목록에 Vercel 환경설정 API와 브라우저 제어가 없고 vercel CLI도 없다. gh는 기존 GitHub 인증으로 배포 상태 조회/코드 푸시에만 사용한다. 쿠키·Vercel 토큰·프로필 추출이나 다른 서비스 키 전용 금지. 신규 접수 비밀은 아직 생성/열람/저장하지 않았다.

CRM 환경변수(서버 전용): CRM_WEBSITE_INTAKE_ENABLED=true,
CRM_CORPORATE_INQUIRY_ORIGIN=https://bscomplete.com,
CRM_CORPORATE_INQUIRY_SHA256, CRM_CORPORATE_INQUIRY_ISSUED_AT,
CRM_CORPORATE_INQUIRY_EXPIRES_AT.
홈페이지 서버의 정확한 변수명은 해당 저장소 담당이 확인하며 동일 corporate 접수 Bearer만 보유한다. CRM은 SHA256 검증값만 보유. NEXT_PUBLIC 변수 사용 금지.

인증 생성/양쪽 등록은 지원되는 보안 설정 도구 또는 사용자 Dashboard 직접 입력으로만 수행한다. 최대 7일 유효기간은 실제 발급 시각에 결정한다. 현재 미발급이라 만료 시각도 없다. 자동 갱신·무기한 연장은 없음. 활성화 시 만료 시각을 운영 담당에게 알리고 만료 전 교체·양쪽 배포·합성 확인 절차를 정해야 한다. 만료 시 요청은 401/비활성으로 거부되고 홈페이지는 접수 완료를 표시하면 안 된다.

최종 검증은 홈페이지 담당과 정상 서버 설정 완료 후 합성 1건만 접수하고 동일 UUID/payload로 재시도한다. 문의 저장 1건·내부 알림 1건을 재조회해야 한다. 내부 알림 생성은 기기 수신/읽음 또는 외부 이메일 성공과 다르다. 현재 이 검증은 미실행이다.

5년 보관 유지, 자동 파기 구현 없음. 문의 endpoint 배포만으로 실제 접수가 된다고 보고하지 않는다. 미설정 시 503 INTAKE_NOT_CONFIGURED가 정상 안전 상태다.
