# 컴플리트 CRM 제품 지식 (AI 비서용)

## 1. 제품 개요

컴플리트 CRM은 팀·개인 업무(`Task`), 브랜드·견적 단위 `Project`, 일정·게시판·채팅·휴가·재무 등을 한 웹앱에서 다루는 CRM입니다. Next.js(App Router)·Prisma·NextAuth·Vercel Cron을 사용합니다.

**기술 스택:** Next.js, React, TypeScript, Prisma, SWR 등(`package.json` 기준).

**역할(`Role`):** `USER`, `TEAM_LEAD`(스키마 주석: 휴가 1차·자금이체 결재 등), `EXECUTIVE`, `ADMIN`(레거시·코드에서 임원과 동일 취급되는 경우 다수). 화면별 세부 권한은 API·`User.permissions` JSON에 따름 **(확인 필요)**.

## 2. 주요 개념

- **Task vs Project:** `Task`는 업무. `Project`는 `Brand` 하위 프로젝트로 견적(`Quotation`)·금액·기한과 연결되며 업무에 `projectId`를 붙일 수 있습니다.
- **`WorkspaceScope`:** `TEAM` / `PERSONAL`. 업무·게시글 등에 쓰이며, 모드 불일치 시 API가 `workspace_mismatch`로 거절할 수 있습니다.
- **열람:** `GET /api/tasks/[id]`는 담당(`assignedToId`·`TaskAssignee`) 또는 `EXECUTIVE`/`ADMIN`만 허용. 작성자라도 담당에 없으면 403 가능.

## 3. 기능별 사용법

### 대시보드

- **어디서:** `/dashboard`
- **언제:** 로그인 후 요약·바로가기.
- **순서:** 1) 진입 2) 카드로 이동.
- **연관:** 일정·업무·공지.
- **주의:** 임원 전용 블록은 프리패치·역할에 따름 **(확인 필요)**.

### 업무 등록·수정·삭제

- **어디서:** `/tasks`, `/tasks/[id]`
- **언제:** 할 일 CRUD.
- **순서:** 1) 생성 2) 담당 지정 3) 수정 4) 삭제는 `deletedAt` 소프트 삭제.
- **연관:** 마인드맵·휴지통.
- **주의:** 담당 미배정 시 상세 403.

### 마인드맵 3단 뷰

- **어디서:** `/tasks` 마인드맵 탭, 상태는 `UserTaskMindmapState`.
- **언제:** 전체·프로젝트별·미분류 조망.
- **순서:** 1) 모드 전환 2) 편집·저장.
- **연관:** 프로젝트·업무 상세.
- **주의:** UI 라벨은 빌드 기준 **(확인 필요)**.

### 완료·접힘·아카이브

- **어디서:** 상태·`taskCompletionShelfQuery`(`src/lib/task-visibility.ts`).
- **언제:** 완료 숨김·장기 보관.
- **순서:** 1) 완료 2) 3일 경과 접힘(`taskDefaultCollapsed`) 3) Cron이 30일 경과 완료에 `archivedAt`.
- **연관:** 검색·필터.
- **주의:** 아카이브≠삭제.

### 휴지통·복구

- **어디서:** `/trash`, `app/api/trash`.
- **언제:** 삭제 복구.
- **순서:** 1) 목록 2) 복구.
- **연관:** 업무.
- **주의:** `hard-delete` Cron이 30일 지난 소프트삭제 영구 삭제.

### 마인드맵 되돌리기

- **어디서:** `POST /api/mindmap/revert`.
- **언제:** 직전 `previousPayload`로 복구.
- **순서:** 요청→없으면 400.
- **연관:** 마인드맵 저장.
- **주의:** 사용자·스코프·`projectId`별.

### 업무 변경 이력

- **어디서:** `TaskRevision`, `TaskAuditLog`, `GET /api/tasks/[id]/audit`.
- **언제:** 변경 추적.
- **순서:** 상세·탭에서 확인.
- **연관:** 편집.
- **주의:** 감사는 담당 또는 임원/관리자.

### 프로젝트(견적)

- **어디서:** `/projects/[id]`, `/quotations` 등.
- **언제:** 견적·프로젝트 단위 묶음.
- **순서:** 1) 생성 2) 업무에 `projectId`.
- **연관:** 업무.
- **주의:** `Project.quoteId` 1:1 대표 견적.

### 일정·캘린더

- **어디서:** `/schedule`, `app/api/schedules`, Google Calendar OAuth 라우트.
- **언제:** 일정·초대.
- **순서:** 생성·연동 **(세부 UI 확인 필요)**.
- **연관:** 대시보드.

### 게시판

- **어디서:** `/board`, `/board/[id]`.
- **언제:** 자료·교육·자유·익명(`BoardPost.category`, `isAnonymous`).
- **순서:** 작성→`workspaceScope` 선택.
- **연관:** 멘션·알림.
- **주의:** 익명 실명 공개 범위는 스키마 주석·UI **(확인 필요)**.

### AI 허브 (6에이전트)

- **어디서:** `/ai-hub`, `src/lib/ai-hub/agents.ts`, `POST /api/ai-hub`.
- **언제:** 용도별 LLM.
- **순서:** 에이전트 선택→호출→`/api/ai-hub/save`로 저장 가능.
- **에이전트:** `cs` CS응대, `copy`·`video`·`compare`는 3모델(`all`), `image` MJ프롬프트, `code` 업무자동화.
- **연관:** AI 비서(별도).

### 반복 업무

- **어디서:** `Task.isRecurring`·`recurringRule`, `app/api/tasks/recurring`.
- **언제:** 주기 업무.
- **순서:** 업무에서 반복 설정.
- **주의:** UI 세부 **(확인 필요)**.

### 멘션·알림

- **어디서:** 본문 멘션·`TaskMention`, `/notifications`.
- **언제:** 호출·수신함.
- **순서:** 멘션 작성→수신 확인.
- **연관:** 다이제스트.

### 푸시 설정

- **어디서:** `/profile`, `onesignal-register` 등.
- **언제:** 웹 푸시.
- **순서:** 권한 허용→구독 ID 등록(`User.playerIds`).
- **연관:** Cron 알림.

### 첨부(Drive)

- **어디서:** `TaskAttachment`, `google-drive-storage`, 본문 이미지 URL 수집.
- **언제:** 파일·이미지.
- **순서:** 첨부→삭제 시 Cron이 Drive 정리 가능.
- **연관:** 휴지통.

### 직원 등록

- **어디서:** `/admin/employees`, `app/api/users`.
- **언제:** 계정 관리.
- **순서:** 관리자 로그인→생성.
- **연관:** `/admin/permissions`.

### 업무일지 AI 초안

- **어디서:** `/tasks` Daily Report 탭, `POST /api/work-logs/ai-draft`.
- **언제:** 일지 초안.
- **순서:** 탭에서 AI 요청.
- **연관:** 정체 감지 Cron(일지 마커로 활동 판별).

### AI 비서 채팅

- **어디서:** `/ai-secretary`, `src/lib/ai-secretary`, `POST /api/ai-secretary/chat`.
- **언제:** 자연어 질의·도구 실행.
- **순서:** 메시지 전송.
- **연관:** 일정·업무.

### 제품 안내(도움말 겸)

- **어디서:** AI 비서 화면·채팅, 내부 참고 `docs/PRODUCT_KNOWLEDGE.md`.
- **언제:** 사용법·메뉴 경로·제한 사항 질문.
- **순서:** AI 비서에 질문하시면 됩니다.

## 4. 자동화

**Cron(UTC, `vercel.json`):** `archive-tasks` 매일 18:00 — 완료 30일→`archivedAt`. `detect-orphan-tasks` 01:00 — 24h 무담당 미완료→`TASK_ORPHAN`. `detect-stale-tasks` 월요 01:00 — 진행 7일 무활동→`STAGNANT`. `due-date-alerts` 00:00 — D-3·D-1·당일지연(`TASK_DUE_D3` 등). `daily-digest` 00:00 — 집계 `DAILY_DIGEST`. `hard-delete` 19:00 — `deletedAt` 30일 하드삭제.

## 5. 자주 묻는 질문

- 삭제 복구: 휴지통 내 기간 내 복구, 이후 Cron 영구삭제 가능.
- 업무 안 보임: 완료/아카이브 필터→팀·개인 모드→담당·권한 순 확인.
- 푸시 없음: 브라우저 권한·OneSignal·담당 여부.
- 상세 403: 담당에 본인 추가 또는 임원/관리자.
- 마인드맵 복구: `/api/mindmap/revert`.
- 완료 찾기: `includeArchived` 등 쿼리 또는 필터 전환.
- 모드 오류: 상단 회사/개인 전환.
- 견적·프로젝트: `Project.quoteId` 연결.
- 개인 게시글: `PERSONAL` 스코프는 직원 목록에서 숨긴다는 스키마 주석.
- 임원/ADMIN 동일 취급 다수—화면마다 예외 **(확인 필요)**.
- 채팅 알림: `/chat/{id}` 링크 기준 읽음 처리 API 존재.

## 6. 제한사항·한계

- `USER`는 관리·타인 업무 상세·감사 등 제한.
- 외부 키(Drive·AI·OneSignal) 미설정 시 기능 실패.
- 본 문서에 없는 UI 위치·라벨은 코드 또는 **(확인 필요)**.

마지막 업데이트: 2026-04-19
