# 90일 접수 키 교체 계약 — 하위호환 코드 우선

키 생성/조회/실제 환경 교체는 브라우저 작업자 한 명이 담당한다. 이 코드 작업에서 중복 발급하지 않는다. 현재 키 만료는 부모 확인 2026-11-08T05:48:53.952Z이며 코드 배포만으로 연장되지 않는다.

## 홈페이지 담당에게 즉시 전달할 계약
- 기존 CORPORATE_INQUIRY_TOKEN / ISSUED_AT / EXPIRES_AT / CONSENT_VERSION / DIRECT_VERCEL / ENABLED 유지. 주 키 최대 기간만 90*86400000 = 7776000000ms로 변경. 기존 7일 값도 계속 허용.
- 서버 Origin https://bscomplete.com, 접수/제한 POST 주소·동의 버전 corporate-inquiry-v1-20261028 변경 없음.
- 홈페이지는 한 키만 전송. 구·신키 수용은 CRM만 담당. 실패 시 임의 키 fallback/자동 키 발급 금지.
- 키 규격 그대로 CSPRNG 32바이트 base64url(패딩 없음), CRM은 토큰 문자열 UTF-8 SHA256 소문자 hex64만 저장. 시간은 실제 발급 기준 UTC ISO8601 Z.

## CRM 변수
현재 주 키 변수 CRM_CORPORATE_INQUIRY_SHA256 / ISSUED_AT / EXPIRES_AT 그대로 유지. ENABLED=true, ORIGIN=https://bscomplete.com.
선택적 이전 키는 다음 네 변수를 전부 추가하거나 전부 제거:
- CRM_CORPORATE_INQUIRY_PREVIOUS_SHA256
- CRM_CORPORATE_INQUIRY_PREVIOUS_ISSUED_AT
- CRM_CORPORATE_INQUIRY_PREVIOUS_EXPIRES_AT
- CRM_CORPORATE_INQUIRY_PREVIOUS_ACCEPT_UNTIL
이전 키 수명도 최대90일. 이전 발급<=새 발급, acceptUntil은 새 발급 이후이면서 새 발급+24시간/이전 만료/새 만료 중 가장 이른 시각 이하. 실제 운영 교체는 1시간 정도를 권장하며 배포 완료 시간을 고려한다. 공백·부분설정·같은 해시 중복은 전체 구성 실패로 차단. 중첩 만료 후 주 키는 정상 유지되고 이전 키만 거부. 최대2개, 권한 범위 불변.

## 배포·교체 순서
1. 양쪽 90일 지원 코드만 기존 7일 설정으로 배포/검증. 현재 접수 유지.
2. 브라우저 작업자가 승인된 1회 신키 생성. CRM의 주 키=신키, previous=현재 구키, 짧은 acceptUntil을 함께 설치해 CRM 재배포. 홈페이지는 아직 구키 유지.
3. CRM 신·구키 수용 준비 확인 후 홈페이지를 신키/동일 발급·만료로 재배포. 기존 문의 ID와 payload 보존하여 합의된 검수만 수행.
4. 성공 확인 후 CRM previous 네 변수 제거·재배포. 구키에 의존하는 배포로 롤백하지 않음. 실패 복구는 중첩 유효기간 안에서만 구 홈페이지로 복귀 가능.
5. 구 배포 URL에도 예전 환경이 남을 수 있으므로 브라우저 작업자가 접근 보호/폐기 정책 확인. 이 코드가 과거 Vercel 배포를 소급 변경하지는 않음. 노출 키를 긴 유효기간으로 연장하지 않음.

## 만료 알림 실행
기존 verifyCronRequest/CRON_SECRET을 사용하는 /api/cron/website-inquiry-key-expiry, Vercel cron 0 0 * * * (매일09:00 KST, 주말 포함). 새 비밀/외부 서비스/새 계정 없음. 기존 CRON_SECRET의 실제 설정/예약 실행 성공은 브라우저 작업자가 값 노출 없이 확인해야 한다. 누락 시 차단하며 새로 생성하지 않는다.
주 키 남은 시간이14일/7일/1일 이하로 진입하면 단계별 대표 내부 알림. 놓친 단계는 한 번에 몰아서 보내지 않고 현재 가장 긴급한 단계만 전송. 만료 후에는 별도 1회 만료 경고. 자동 교체/갱신 아님.
NotificationLog의 결정적 PK(발급/만료/단계 기반)와 Notification을 동일 트랜잭션으로 저장. 동시/재실행/알림 삭제 후에도 로그가 있으면 중복 생성 안 함. 둘 다 삭제하면 중복 방지 기록도 사라지므로 유지해야 한다. 기존 테이블 재사용, 마이그레이션 없음.
이 구현은 CRM 내부 알림 저장이며 외부 메일/OS push/읽음 보장은 아님. 배포 후 cron 등록·기존 인증·실행로그 및 대표 알림1건/재실행 중복0건까지 확인해야 알림 운영 검증 완료. 정상 cron 실행 경로가 없으면 미검증으로 보고한다.
