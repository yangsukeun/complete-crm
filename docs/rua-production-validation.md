# 개인 기록 운영 연결 검증

기존 NextAuth getAppSession의 사용자 ID만 신뢰한다. 대표 ID와 다른 관리자·이사·비로그인은 페이지/API에서 저장소 접근 전에 차단한다. 입력 actor나 role은 허용하지 않는다. 일반 채팅·검색·내보내기에는 연결하지 않는다. 전체 ChatGPT 대화 자동 동기화 및 외부 AI는 미연결이다.

운영 CRM whoami ID와 허용 ID 일치, 해당 User 행 존재 및 ADMIN 역할을 비밀번호 조회 없이 확인했다. rua_private_commands는 일반 RLS 및 PUBLIC/anon/authenticated 새 객체 권한 회수만 적용했다. 기존 service_role 권한과 FORCE RLS 설정은 변경하지 않았다. 합성 트랜잭션 삽입·조회·rollback 후 기록 0건을 확인했다. 운영 시 기존 Prisma 연결만 사용하고 로컬 저장/테스트 인증 fallback은 없다.

API 합성 세션 테스트: 대표 읽기/저장, 비로그인·이사·다른 관리자 차단, 중복 저장, 공유/AI/위조 actor 거절, DB 장애 응답. 이는 실제 브라우저 E2E와 구분한다. Windows 브라우저의 URL 식별 정책 차단으로 실제 로그인 후 저장·새로고침은 미검증이다. 배포 후 대표가 기존 로그인으로 /rua-project에서 확인해야 한다.

코드 롤백은 개인 기능 커밋을 revert하고 재배포한다. 개인 테이블/기록은 삭제하지 않는다. 3PL 변경은 별도 커밋이며 개인 테이블 승인은 3PL DB/권한 변경을 포함하지 않는다. 비밀번호 교체는 이번에 실행하지 않는다.
