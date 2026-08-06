# P0-8 성능 기준선 (2026-08-06)

코드 수정 없이 **정적 분석**만 수행. 실측(네트워크 워터폴·로드 시간)은 브라우저에서 별도 기입.

SWR Provider 기본값 (`src/components/providers.tsx`): `dedupingInterval=30000`, `revalidateOnFocus=false`, `revalidateOnReconnect=true`.

---

## STEP 1. 대상 페이지 (실제 라우트)

| 명칭 | 실제 경로 | 엔트리 |
|------|-----------|--------|
| 대시보드 | `/dashboard` | `app/dashboard/page.tsx` (RSC + 클라 섹션) |
| 게시판 | `/board` | `app/board/page.tsx` → `board-page-client.tsx` |
| Projects | `/tasks` (네비 라벨 "Projects") | `app/tasks/page.tsx` |
| 스케줄 | `/schedule` | `app/schedule/page.tsx` |
| 채팅 | `/chat` | `app/chat/page.tsx` → `chat-page-client.tsx` |

참고: `/projects/[id]`는 프로젝트 상세, `/admin/projects`는 관리자용. 네비 메인 "Projects"는 **`/tasks`**.

---

## STEP 2. API 호출 인벤토리 (정적)

### 2-A. 공통 레이아웃 (모든 인증 페이지에 부과)

| SWR key / URL | 호출 위치 | refreshInterval | dedupingInterval |
|---------------|-----------|-----------------|------------------|
| `/api/notifications/unread-count` | `src/components/notification-bell.tsx:42` | 없음 (Realtime mutate) | 300000 |
| `/api/chats/unread-count` | `src/components/app-nav.tsx:166` | 없음 | 30000 |
| `/api/finance/alerts/count` (`SWR_KEYS.financeAlertsCount`) | `src/components/app-nav.tsx:199` | 없음 (`revalidateOnFocus: true`) | 120000 |
| `/api/tasks?assignedToMe=1&isNew=1` | `src/components/app-nav.tsx:219` | 없음 | 60000 |
| `/api/board/new-count?since=…` | `src/components/app-nav.tsx:269` | 없음 (`revalidateOnFocus: true`) | 45000 |
| `POST /api/users/heartbeat` | `src/components/presence-heartbeat.tsx:17` | **45s** 폴링 | n/a |
| `GET /api/supabase/realtime-token` | `src/lib/supabase/realtime-client.ts` (DeferredRealtimeBridges) | 토큰 생성/갱신 시 | n/a |
| Floating: `/api/chats/:id` + `/messages?limit=50` | `src/components/floating-chat-panel.tsx:90-92,124+` | 채팅 페이지 외 **~12s** | n/a |
| OneSignal register | `src/components/one-signal-push-token-register.tsx:133` | 로그인/구독 변경 시 | n/a |

Layout SSR: `getHeaderBootstrapData`가 mode/logo/unread를 시드 → SWR fallback.

대략 **마운트 시 공통 클라이언트 호출 5~8개** + heartbeat/floating 지속 비용.

### 2-B. 대시보드 `/dashboard`

| SWR key / URL | 호출 위치 | refreshInterval | dedupingInterval |
|---------------|-----------|-----------------|------------------|
| (RSC) prisma + `dashboard-prefetch` | `app/dashboard/page.tsx`, `src/lib/dashboard-prefetch.ts` | SSR | — |
| `/api/announcements` | `src/components/dashboard-announcements.tsx:31` | 없음 (`revalidateOnFocus: true`) | 15000 |
| `/api/dashboard/sales-stats` | `src/components/dashboard-sales-section.tsx:27` | 없음 (`revalidateOnFocus: true`) | 기본 30000 |
| `POST /api/attendance` | `dashboard-attendance.tsx` | 클릭 시만 | n/a |

정적 분석 호출수(클라 SWR 기준): **2** (+ 공통 레이아웃).

### 2-C. 게시판 `/board`

| SWR key / URL | 호출 위치 | refreshInterval | dedupingInterval |
|---------------|-----------|-----------------|------------------|
| `/api/announcements` | `app/board/board-page-client.tsx:132` | 없음 | 15000 |
| `GET /api/board?limit=20&offset=…` | `board-page-client.tsx:164` | 마운트/필터 (비SWR fetch) | n/a |
| Peek `GET /api/board/:id` | `src/components/board-post-peek-sheet.tsx:44` | 카드 열 때 | n/a |
| 첨부 preview-meta (상세) | `attachment-drive-preview.tsx:60` | PENDING 시 **2.5s** | 기본 30000 |

**N+1:** 목록 → peek 시 단건; 첨부 N개면 preview-meta N회.

정적 분석 호출수(마운트): **2** (+ peek/첨부 시 추가).

### 2-D. Projects `/tasks`

| SWR key / URL | 호출 위치 | refreshInterval | dedupingInterval |
|---------------|-----------|-----------------|------------------|
| `/api/users` (관리자) | `app/tasks/page.tsx:446` | 없음 | 기본 30000 |
| `/api/tasks?all=1&…creationSource=PROJECT` | `page.tsx:621-633` | 없음 | 300000 |
| `/api/tasks?limit=20&offset=…` (infinite) | `page.tsx:647-663` | 없음 | 30000 |
| `/api/projects?mindmapSummary=1` | `page.tsx:667` | mindmap 뷰 | 20000 |
| `/api/tasks?projectId=…` | `page.tsx:685-698` | mindmap 스코프 | 120000 |
| `/api/tasks/links` | `page.tsx:721` | mindmap | 12000 |
| `/api/mindmap?projectId=` | `view-tree.tsx:827` | 캔버스 마운트 | n/a |
| 상세 `/api/tasks/:id` + `/comments` | task-detail-content | 열 때 | n/a |

**N+1:** 목록 → 상세 열 때 2병렬 GET.

정적 분석 호출수(기본 리스트 뷰): **2~3** (+ 관리자 users); mindmap 시 **+3~4**.

### 2-E. 스케줄 `/schedule`

| SWR key / URL | 호출 위치 | refreshInterval | dedupingInterval |
|---------------|-----------|-----------------|------------------|
| `/api/schedules/bundle` | `app/schedule/page.tsx:992` | 없음 | 12000 |
| `/api/tasks?calendarDue=1&…` | `page.tsx:1015` | schedule 탭 | 60000 |
| `/api/projects?noDueDate=1` | `page.tsx:1023` | schedule 탭 | 120000 |
| `SWR_KEYS.scheduleStandaloneTasks` (`/api/tasks?projectId=null…`) | `page.tsx:1054` | tasks/schedule 탭 | 300000 |
| `/api/tasks?dueDay=…` | `page.tsx:1064` | diary 탭 | 60000 |
| `/api/schedules/invites` | `page.tsx:1093` | 세션 시 | 20000 |
| `/api/leave` | `page.tsx:1099` | 세션 시 | 25000 |
| `/api/memo?date=` | `page.tsx:1108` | diary | 30000 |
| `/api/integrations/google-calendar` | `page.tsx:1117` | schedule 탭 | 60000 |
| GCal events fetch | `page.tsx:1144` | 연동 시 useEffect | n/a |

정적 분석 호출수(schedule 탭 기본): **약 6~8** (+ 공통).

### 2-F. 채팅 `/chat`

| SWR key / URL | 호출 위치 | refreshInterval | dedupingInterval |
|---------------|-----------|-----------------|------------------|
| `/api/chats` | `chat-page-client.tsx:267` | 없음 (마운트 mutate 추가) | 5000 |
| `/api/chats/:id/messages` | `chat-page-client.tsx:412-423` | **3s** 폴링 (+ mutateChats) | n/a |
| `?readMeta=1` | `chat-page-client.tsx:615-626` | **24s** | n/a |
| `POST /api/chats/read-sync` | `chat-page-client.tsx:352` | 목록 동기화 시 | n/a |
| `/api/users/list`, `/api/schedules` | 모달 오픈 시 | 이벤트 | n/a |

정적 분석 호출수(방 선택 시): **1 SWR + 3s/24s 폴링**.

---

## STEP 3. 서버 측 무거운 쿼리 (핫패스)

### findMany without `take` (전체 조회)

| 파일:라인 | 설명 |
|-----------|------|
| `app/api/tasks/route.ts:474-480` | `all=1` 또는 `projectId` 시 Task **전부** |
| `app/api/tasks/route.ts:424` 부근 | `calendarDue=1` 월/주 마감 — take 없음 |
| `app/api/tasks/route.ts:460` 부근 | `dueDay` — take 없음 |
| `app/api/schedules/bundle/route.ts:26,41` | 스코프 내 Schedule **전부** |
| `app/api/schedules/route.ts:32` | 레거시 전체 Schedule (채팅 모달이 호출) |
| `app/api/leave/route.ts:58` | LeaveRequest **전부** |
| `app/api/tasks/links/route.ts:19` | TaskLink **전부** |
| `app/api/projects/route.ts:50` | mindmapSummary 프로젝트 전부 |
| `app/api/projects/route.ts:123` | noDueDate 프로젝트 전부 |

### select 없이 풀 로우 (또는 include만)

| 파일:라인 | 설명 |
|-----------|------|
| `app/api/schedules/route.ts:32` | Schedule 전체 컬럼 |
| `app/api/schedules/invites/route.ts:13` | ScheduleInvite 풀 로우 |
| `app/api/leave/route.ts:58` | LeaveRequest 풀 + 깊은 user |
| `app/api/chats/route.ts:69` | ChatParticipant 풀 로우 + nested |
| `app/api/tasks/links/route.ts:19` | TaskLink 풀 로우 |

### include 2중첩 이상

| 파일:라인 | 설명 |
|-----------|------|
| `app/api/chats/route.ts:72-94` | `participant → chat → (participants + messages)` |
| `app/api/leave/route.ts:60-69` | `user → currentProject → brand` |
| `app/api/chats/route.ts:181-184` | POST: `participants → user` |

양호: `/api/board` GET(limit+select), notifications, dashboard-prefetch(take+select), chat messages GET(take).

---

## STEP 4. 기준선 표

| 페이지 | 정적분석 호출수 | 폴링 항목 | 1차 개선 후 (예상) | 실측 요청수(추후 기입) | 실측 로드시간(추후 기입) |
|--------|-----------------|-----------|-------------------|------------------------|--------------------------|
| 공통 레이아웃 | 5~8 + heartbeat | heartbeat 45s; floating ~12s | floating **30s** + 탭 숨김 시 중단 | | |
| `/dashboard` | 페이지 2 (+공통) | (공통만) | 동일 | | |
| `/board` | 페이지 2 (+peek/첨부) | preview PENDING 시 2.5s | 동일 | | |
| `/tasks` (Projects) | 리스트 2~3 / mindmap 5+ (+공통) | (공통만) | `all=1`≤500, `projectId`≤200 | | |
| `/schedule` | 탭당 6~8 (+공통) | (공통만; SWR dedupe만) | bundle **from/to = 현재월±1**, 월 이동 시 재요청 | | |
| `/chat` | 1 + 폴링 | **messages 3s**, readMeta 24s | messages **12s** + 신규시만 mutateChats + 탭 숨김 중단; chats select 축소 | | |

실측: DevTools Network에서 첫 로드(도큐먼트 제외 XHR/fetch) 수와 DomContentLoaded~Idle 시간을 기입.

### 1차 개선 적용 (2026-08-06)

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 채팅 메시지 폴링 | 3s + 매 tick mutateChats | 12s, 새 메시지 있을 때만 mutate, hidden 중단 |
| floating chat | 12s × messages+chat | 30s, hidden 중단 (열린 패널 본문용 — unread 배지와 역할 다름) |
| tasks `all=1` / `projectId` | unbounded | take 500 / 200, all은 updatedAt desc |
| schedules/bundle | 전체 일정 | from/to 필수(기본 현재월±1) |
| chats GET | include 풀 로우 + 중첩 | select (id/이름/멤버명/lastMessage 1) |

DB 영향(2026-08-06): PROJECT Task 126건(전부 projectId null), 프로젝트당 200 초과 **0**, Schedule 16건.


## STEP 5. 개선 후보 Top 10 (수정 금지 · 후보만)

| # | 위치 | 문제 유형 | 예상 효과 |
|---|------|-----------|-----------|
| 1 | `app/chat/chat-page-client.tsx:412-423` | 폴링과다 (3s + 매 tick mutateChats) | **상** |
| 2 | `app/api/tasks/route.ts:474-480` (`all=1` / projectId) | 전체조회 | **상** |
| 3 | `app/api/chats/route.ts:69-94` | 중첩 include / 무거운 목록 | **상** |
| 4 | `app/api/schedules/bundle/route.ts:26,41` | 전체조회 (캘린더 전체 Schedule) | **상** |
| 5 | `src/components/floating-chat-panel.tsx:124+` | 폴링과다 (~12s×2 GET, /chat 외) | **중** |
| 6 | `app/schedule/page.tsx:992-1102` | 중복fetch (번들+leave+invites+tasks 동시 다수 SWR) | **중** |
| 7 | `app/api/leave/route.ts:58-69` | 전체조회 + 깊은 include | **중** |
| 8 | `app/chat/chat-page-client.tsx:643` → `/api/schedules` | 전체조회 (모달용 레거시 API) | **중** |
| 9 | `src/components/board-post-peek-sheet.tsx:44` + `attachment-drive-preview.tsx:60` | N+1 | **중** |
| 10 | `src/components/presence-heartbeat.tsx:17` + nav badge focus revalidate | 폴링/중복fetch (전역 상시 비용) | **하~중** |

---

## 분석 메타

- 일자: 2026-08-06
- 방법: 정적 grep/파일 열람 (실행 프로파일·Lighthouse 미실시)
- 관련: [PERF](./PERFORMANCE.md), [PERF-BUNDLE](./PERFORMANCE-BUNDLE.md)
