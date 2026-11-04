# 서영 정산 운영 반영 — 2026-11-04

사용자의 '쓸수 있게 만들어' 요청에 따라 서영 정산 화면과 최소 추가형 DB 변경만 운영 반영한다. 실발주·청구·외부 발송·직원 권한 확대는 범위 밖이다.

## 확인된 대상과 범위

- GitHub: yangsukeun/complete-crm, main expected `823abb0c89a6d0323608cc8ac103a4068caefdda`.
- Vercel: team `team_lhDN2pvqAtPrUy8ZEvlvOKzK`, project `prj_6yno1QO3JNdng7HhriDTSHfti4an`.
- 기존 READY production: `dpl_BVkBZbZaD23euBsEHgWxQSQnsdKa`, 동일 Git SHA, www.cpcrm.co.kr 별칭 연결 확인.
- 로컬 원본 저장소에 기록된 다른 Vercel 팀/프로젝트는 오래된 연결이었다. 그 팀 조회 403 및 정식 승인 링크 생성 404 후 재시도하지 않았다. GitHub 실제 배포 상태가 가리킨 위 팀/프로젝트를 확인하여 정상 조회 성공했다. 새 권한·키 발급 없음.
- DB: 기존 CRM `vgelnrycivorwczdqpsu`. 두 정산 테이블 미존재, 기존 User 존재 확인.
- 변경은 서영 신규 파일/테스트/문서 및 3PL 메뉴 진입점뿐이다. 다른 로컬 저장소의 미배포 변경은 포함하지 않는다.

## DB 영향·복구

- 하나의 트랜잭션에서 `seoyoung_settlement_drafts`, `seoyoung_settlement_events`만 생성. 기존 User는 FK 참조만 한다. 기존 행 수정/삭제, 기본 권한 설정 변경 없음.
- RLS 적용, PUBLIC/anon/authenticated/service_role의 **새 두 테이블에 대한** 기본 grants 회수. 기존 CRM 서버 postgres 경로만 사용. 새 역할·토큰·브라우저 정책을 만들지 않는다.
- 운영에서 확인한 default grants를 격리 PG cluster06에 재현해 명시 회수 및 실제 저장/재시작/충돌/권한 검증 통과. migration SHA256 `c23440c12f8ee4803b82708d80d70568344e90e209636354c3407a55d7f2619c`.
- 기존 운영 백업의 생성 시각/PITR 보존 기간은 현재 도구에서 확인하지 못했다. 이번 변경은 기존 데이터를 바꾸지 않으므로 기존 데이터 복원에 의존하지 않는다. 실패한 DDL은 트랜잭션 rollback, 앱 실패는 위 기존 READY 버전 복귀. 새 정산 테이블/저장 초안은 삭제하지 않고 보존하여 재배포 시 사용한다. 별도 DROP/DB 복원은 실행하지 않는다.
- 기존 프로젝트 advisory의 다른 테이블 RLS 경고는 이번 변경 이전부터 존재한다. 범위 밖 기존 테이블의 정책은 수정하지 않는다.

## 운영 검수 계획

배포 직전 원격 expected SHA 재확인 → 새 테이블 적용/권한 재조회 → 일반 fast-forward push(강제 push 없음) → 해당 commit의 READY 및 도메인 연결 확인 → 비로그인 401/리디렉션 → 기존 정상 Chrome 로그인으로 3PL 메뉴/정산 화면, 합성 전용 월 초안 저장·재열기·다운로드 검사. 실제 10월 원본은 자동 등록/확정하지 않는다.

현재 브라우저에서는 기존 3PL 영업 화면을 정상 조회했으며 새 정산 URL은 배포 전 404다. 로그인 쿠키·자격증명 추출/복제 없음. 실제 운영 결과는 아래에 추가한다.
