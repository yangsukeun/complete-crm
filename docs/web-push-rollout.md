# 웹푸시 변경 검토 (2026-10-27)

기존 OneSignal 앱·키·서비스워커를 재사용한다. 새 키, DB 모델, 권한 정책, 유료 서비스는 추가하지 않는다. 실제 직원 메시지나 시험 푸시는 개발 과정에서 보내지 않았다.

## 동작

- 채팅은 일반 CRM 최근 3분 활동 때문에 푸시를 생략하지 않는다. 현재 보이는 해당 채팅방은 SDK foreground 이벤트에서 억제한다. 숨긴 탭은 이 조건에 해당하지 않는다.
- 같은 방 미읽음 알림의 영구 억제를 60초 조용한 기간 기준으로 변경했다. 연속 메시지는 조용한 기간을 연장한다.
- 채팅 푸시 본문은 일반 안내만 표시한다. 사용자 이름·대화 본문은 넣지 않는다.
- 명시적 기기 알림 켜기/끄기, 상태 확인, 본인 기기 시험 버튼을 제공한다. 자동 권한 요청과 자동 optIn을 제거했다. 로그인 계정 전환/로그아웃 시 구독을 끄며 새 계정에서 다시 켜야 한다.
- 서버가 OneSignal external_id의 현재 활성 구독을 확인하고 기존 다른 사용자 소유 구독의 임의 이전을 거절한다. 비활성 계정은 전송 대상에서 제외한다. 전송 결과 불확실 시 다른 경로로 중복 발송하지 않는다.
- 시험 알림은 본인 활성 구독만, POST/동일 출처/로그인 검증 후 접수한다. 동일 요청 키는 재사용하고 새 요청은 분당 1회로 제한한다. 20초 후 전송 예약, 접수 성공은 실제 수신 성공을 뜻하지 않는다. GET은 발송하지 않는다.

## 검증과 한계

합성 API/전송/멱등성/비활성 계정/구독 소유권 테스트 및 관련 회귀 48개 통과. 로컬 PC·모바일 설정 화면과 넘침, 자동 시험 미발송 확인. 변경 파일 ESLint·TypeScript·Next production 빌드 통과 후 배포한다. 기존 전체 린트 문제를 이번 변경에서 해결했다고 주장하지 않는다.

실제 운영 키 유효성 및 로그인한 사용자 기기에서 닫힌 창 수신은 미검증이다. 상태 확인 버튼이 설정 누락·인증 실패·구독 상태를 비밀값 없이 구분한다. OneSignal Web SDK의 외부 ID 바인딩 자체를 암호학적 신원 증명이라고 주장하지 않는다. 새 Identity Verification 설정은 추가하지 않았다.

사용자 확인: CRM 채팅 알림 설정 → 브라우저 밖 알림 → 알림 켜기 → 브라우저 허용 → 상태 확인 → 내 기기로 시험 알림. 접수 후 창을 닫고 확인한다. 브라우저 완전 종료·강제 중지·절전·OS 제한에서는 수신 보장이 없다. iOS/iPadOS는 16.4 이상에서 홈 화면 웹앱과 명시적 허용이 필요하다. 인앱 소리와 OS 알림 소리는 별도이다.

복구: 이 변경 커밋만 revert 후 재배포. 기존 3PL/개인 기록 테이블은 변경하지 않는다. 기기에서 사용자가 변경한 알림 권한은 자동 되돌리지 않는다.

공식 근거: https://documentation.onesignal.com/docs/en/web-push-setup , https://documentation.onesignal.com/docs/en/web-sdk-reference , https://documentation.onesignal.com/reference/view-user , https://documentation.onesignal.com/reference/push-notification , https://documentation.onesignal.com/docs/en/browser-behavior-and-unsubscribes , https://documentation.onesignal.com/docs/en/web-push-for-ios
