# 오늘의 이야기 실제 연동 검토 — 운영 적용 전

기준 운영 커밋: 3518e9c. 후속 승인에 따라 실제 서비스·API·MCP 도구·화면을 준비했다. 아래의 이전 검토 설명은 후속 실행 기록과 함께 읽는다.

## 확인한 경계

현재 일기는 대표 전용 rua_private_commands에 원문과 분류 변경 명령을 저장한다. 루가 자동 수신하는 큐/웹훅은 없고 현재 제공된 CRM 도구는 단계 조회/진행 저장 등뿐이다. 별개 모델·API 키를 추가해 루라고 표시하지 않는다.

2026-10-27 운영 DB 카탈로그만 읽었다. UserNote/Project는 relrowsecurity=false, anon/authenticated의 SELECT 권한이 모두 true였다. rua_private_commands는 RLS=true, 두 역할 SELECT=false였다. 따라서 개인 일기를 UserNote/Project의 본문에 옮기는 안은 채택하지 않는다. 실제 외부 Data API 노출 여부·기존 자료 유출은 시험하거나 확인하지 않았다. 기존 테이블 권한 변경도 실행하지 않았다.

## 준비한 최소안

- 원문은 기존 보호된 일기 테이블에 유지한다.
- 정확한 Project.id를 선택하고 해당 원문 구간을 확인한 경우만 별도 대표 전용 rua_project_updates에 기록한다. 일반 프로젝트 본문·진행률·완료·직원 공유는 변경하지 않는다.
- 새 테이블의 요청 키, 출처 ID/버전/구간, 대상 프로젝트 ID, 작성자, 기록 시각, 결과로 근거를 남긴다. 새 테이블 하나와 기본키/유일 인덱스만 필요하며 시퀀스는 없다.
- 같은 출처 구간은 재시도/동시 요청에도 한 번 반영한다. 대상·버전 변경은 추가 확인 필요로 남긴다. 원문 지시는 실행하지 않는다. 저장 실패는 반영 완료가 아니다.
- 서비스 초안은 저장 트랜잭션 어댑터를 요구한다. 현재 합성 어댑터로만 테스트했으며 실제 PG 어댑터·화면·운영 API는 미연결이다.

## 운영 적용에 필요한 구체 확인

1. 새 public.rua_project_updates와 인덱스 생성, 이 새 객체에만 일반 RLS 및 PUBLIC/anon/authenticated 직접 접근 차단. 서버의 기존 역할과 service_role은 유지, FORCE RLS·기존 테이블 권한 변경 없음. 서버 역할/객체 미존재를 적용 직전 재확인한다. 롤백은 앱 경로를 이전 버전으로 복구하고 저장 기록은 삭제하지 않는다.
2. 기존 CRM OAuth에서 대표 본인에게만 개인 일기 조회·확인한 구간의 프로젝트 개인 기록 반영 도구를 제공할지 확인 필요. 이는 기존 단계 도구보다 개인 자료 접근 범위가 넓어진다. 새 키/OAuth 발급 없이 구현 가능하지만 현재 연결된 도구 목록의 갱신·실제 호출 검증은 별도다. CRM 저장만으로 현재 대화에 자동 메시지가 도착하는 기능은 없다. 읽음 상태는 실제 도구 호출 때만 기록하며 AI 이해를 증명하지 않는다.

## 최종검수 범위

합성: 비로그인/다른 관리자/비활성 대표 차단, 미확인 분류/없는 프로젝트/낡은 버전 거절, 동시 중복·실패 복구·원문 보존·수정 충돌. 실제 운영 로그인 저장/새로고침/다른 계정 차단은 지원되는 인증 세션이 있어야 가능하며 기존 Chrome URL 접근 차단을 우회하지 않는다. 실제 운영 기록은 이 초안에서 생성하지 않았다.

## OCR 작업 분리

이 변경은 app/rua-project 및 개인 기록 서비스 범위다. OCR 담당의 photo-inbound-v3나 입고 확정 코드는 수정하지 않는다. CRM 도구 진입의 후속 연결 지점은 3PL 도구 영역이며 reviewId/companyId/revision 및 resume-review 계약을 따른다. 실제 ERP 호스트·CRM/ERP 사용자 및 고객사 매핑 검증 전에는 localhost:3229를 직원용 서비스로 표시하지 않는다. 일기 본문을 OCR 승인·입고 확정 요청으로 해석하지 않는다.

## 승인 후 실행 기록

사용자가 새 개인 기록 테이블과 대표 일기 조회·선택 반영 도구를 명시 승인했다. create_rua_private_project_updates 적용 성공. 새 테이블만 RLS on/FORCE off, postgres 소유, anon/authenticated SELECT 불가, service_role 유지. 실제 PostgreSQL 합성 INSERT/조회/출처 중복 거절을 트랜잭션 롤백으로 확인했고 잔여 0건이다. 기존 UserNote/Project 권한은 변경하지 않았다.

공개 로그인 페이지에 배포되는 공개 anon 키를 메모리에서만 사용한 REST limit=0 검증은 UserNote/Project 둘 다 HTTP 200, 반환 0행이었다. 키 없는 요청은 401. 따라서 키 없는 무인증 공개 조회와는 다르지만 공개 키를 가진 익명 역할의 REST SELECT 경로가 열린 것은 확인했다. 실제 자료나 행 수를 조회하지 않았으므로 유출 여부는 미확인이다.

실제 서비스: src/lib/rua-processing.ts, rua-processing-postgres.ts, /api/rua-project-processing. 원문 구간에서 정확한 Project.id를 선택한 후 개인 기록으로 반영한다. /projects/[id] 하단에 대표 전용 기록을 표시하며 일반 프로젝트 description/status 등은 수정하지 않는다. MCP get_my_private_diary, apply_my_private_diary_record는 기존 OAuth 인증 후 fresh owner/accountDisabled 검사를 수행한다. 새 키·OAuth·모델 호출 없음. 도구 조회는 필요할 때 호출하는 방식이며 자동으로 현재 대화를 깨우지 않는다. 도구 목록 갱신·실제 인증 호출 검증은 배포 후 별도 확인해야 한다.

헤더 이미지 libfile_9e5528b674908191829d0f7c81b23dcc: 현재 Library 공식 helper가 Windows os.setxattr 미지원으로 실패, 최종 header.png 존재하지 않음. 임시 다운로드나 다른 경로로 우회하지 않았으며 픽셀 미확인 때문에 헤더 개편은 진행하지 않았다.

CRM에는 입고 실행 API/재고 처리 모듈이 검색되지 않고 3PL OCR 준비 안내만 존재한다. 기존 Vercel Next.js CRM에 Windows.Media.Ocr를 직접 탑재하는 안은 사용하지 않는다. OCR 담당의 브라우저 어댑터 검증과 실제 ERP 저장·권한 경로를 확정한 뒤 CRM /logistics 도구에서 /inbound/photo/resume의 검수ID/고객사/revision 계약을 연결해야 한다. 현재 자료로는 기존 정적 ERP 주소를 실입고 서비스라고 표시할 수 없다. OCR 작업 파일은 수정하지 않았다.
