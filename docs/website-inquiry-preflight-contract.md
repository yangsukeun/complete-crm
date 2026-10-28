# 홈페이지 앞단 공유 요청 제한 계약 v1 — 로컬 구현, 운영 미활성

## 통신
- 동일 CRM 주소: POST https://www.cpcrm.co.kr/api/integrations/website-inquiries/v1
- 동일 corporate 접수 전용 Bearer(최대7일). 새 credential/GET 권한/다른 CRM 조회 경로 없음.
- 헤더: Authorization: Bearer <서버값>, Origin: <확정된 홈페이지 Origin>, Content-Type: application/json, X-Inquiry-Operation: rate-limit.
- JSON: {day:"YYYY-MM-DD",subject_hash:"64자리 hex HMAC"}. IP/연락처/문의본문은 보내지 않는다.
- 홈페이지 서버에서 검증된 hosting client IP를 받아 privateInquirySubject(address, 기존접수토큰) 호출. UTC 날짜+corporate 목적+표준화된 IP에 HMAC-SHA256 적용. 브라우저 body 또는 임의 X-Forwarded-For를 신뢰하지 않는다. 원문을 로그/DB/URL에 쓰지 않는다. 일 단위 pseudonymous 해시이므로 완전한 익명이라고 주장하지 않는다.
- 성공 200 {operation:"rate-limit",allowed:true,persisted:false}; 제한 429 Retry-After:60. 401/422/503/통신유실/비정상응답은 접수를 계속하지 않는다. 자동 재시도하지 않는다. 성공은 문의 저장이 아니다.
- 홈페이지 createHandler의 allowRequest에 createInquiryPreflightClient({token,origin})(verifiedClientAddress)를 연결한다. 이후 기존 sendToCRM으로 일반 접수 POST를 별도 전송한다. 일반 접수에는 X-Inquiry-Operation 헤더를 붙이지 않는다.
- 실패·네트워크 유실 시 제한 슬롯이 이미 소비됐을 수 있다. 재전송으로 우회하지 않는다. NAT 공유 이용자는 같은 제한을 공유한다.

## 제한과 영속성
- shared PG transaction/advisory lock 사용. preflight 사이트전체60회/분 + 같은 일 단위 대상5회/10분. 실제 접수 사이트전체60회/분도 별도 유지.
- 기존 website_inquiry_rate_limits에 bucket_key를 추가하고 PK를 (source_site,bucket_key)로 변경하는 로컬 초안이다. 기존행은 site로 유지하며 site/preflight/subject:<day>:<digest>만 허용한다.
- preflight 전역상한 때문에 신규 대상 카운터는 사이트당 시간당 약3600행 이내로 제한된다. 코드의 한 시간 지난 비-site 카운터 정리는 단기 제한 메타데이터만 대상으로 한다. 문의·내부 알림·기존 사용자 데이터를 삭제하지 않는다.
- schema/runtime 동시 준비가 필요하다. bucket_key가 없으면 runtime 전체 비활성으로 닫힌다. 운영 테이블 변경/정리 실행은 아직 미적용이다.
- 새 외부 서비스/비밀키/직원 권한/테이블 생성 없음. 현재 Origin 상수는 기존 승인받은 개별 배포 URL 그대로이며 complete-renewal-review.vercel.app로 바꾸지 않았다.

## 검증 범위
합성 HTTP roundtrip에서 홈페이지 client→인증→제한응답, 8회 중 5회 허용, 원문 IP 부재, IPv6 표준화, 날짜 변경 해시 변화, 잘못된 필드/날짜/비인증/미설정/가짜 성공 응답 차단. 실제 공유 PG 확장/동시요청 검증은 DDL 미적용으로 미실행. 기존 문의 저장/알림 테스트와 함께 회귀한다. 홈페이지 실제 trusted-IP 공급자와 최종 Origin 확인 전 실수집 활성화 금지.

## 적용·복구 순서
확정 Origin/홈페이지 IP 공급자 확인 → 기존 site행과 PK 확인 → 초안 확장 승인·적용 → 새 runtime 배포 → 기존 7일 인증 서버설정 → 합성 앞단/접수 종단시험. 복구는 intake flag off로 중단한다. 기존 site행은 유지하며 추가행의 영구삭제나 PK 되돌리기는 별도 검토한다. 현재는 로컬 코드와 문서만 변경했다.
