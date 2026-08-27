# COMPLETE CRM 구조 설명서 (GPT용)

이 문서는 **주식회사 컴플리트 내부 CRM**의 실제 코드 기준 구조다.
ChatGPT·Claude·Cursor 등에게 붙여 넣고 “이 CRM에서 ○○을 고쳐줘”라고 요청할 때 쓴다.

**이 문서에 없는 기능을 추측해서 만들지 말 것.** 코드가 없으면 없다고 말하고, 확인이 필요하면 해당 파일을 읽으라고 할 것.

---

## 0. GPT에게 주는 시작 프롬프트 (복사용)

아래를 이 문서와 함께 붙인다.

```
너는 주식회사 컴플리트 내부 CRM(COMPLETE CRM) 코드를 다루는 개발 보조다.
레포는 Next.js 16 App Router + Prisma(PostgreSQL/Supabase) + NextAuth v5다.
업무를 시작하기 전에 이 구조 설명서를 따른다.

규칙:
- 없는 기능을 발명하지 않는다.
- 권한은 Role만이 아니라 부서(본사/CS/3PL)와 User.permissions 해석 결과를 본다.
- 날짜·근태·연차는 UTC 날짜가 아니라 KST(src/lib/date-kst.ts)를 쓴다.
- /api/* 는 미들웨어가 막지 않는다. 각 라우트에서 getAppSession()으로 인증한다.
- 업로드용 Google Drive 폴더(GOOGLE_DRIVE_FOLDER_ID)와 탐색기 루트(GOOGLE_DRIVE_EXPLORER_FOLDER_ID)를 섞지 않는다.
- UI 문구는 한국어. 커밋 메시지도 한국어.
- 답할 때 관련 파일 경로를 먼저 제시한다.
```

---

## 1. 이 제품이 무엇인가

**COMPLETE CRM**은 범용 SaaS CRM이 아니다. 한 회사 전용 웹앱이다.

- 회사: 주식회사 컴플리트
- 운영 도메인: `https://www.cpcrm.co.kr`
- 언어: UI·에러·토스트 전부 한국어
- 용도: 브랜드/프로젝트 업무, 휴가·근태, 자금 결재, 견적, 사내 게시판·채팅, Google Drive 탐색기, CS센터 운영

조직은 코드상 셋으로 나뉜다 (`src/lib/org-access.ts`).

| 조직 | 코드 | 누구 | 로그인 후 홈 |
|------|------|------|----------------|
| 본사 | `HQ` | 마케팅, 경영지원, 임원 등 | `/dashboard` |
| CS센터 (투헌드래드) | `CS` | CS팀 | `/cs-tools` |
| 물류 3PL | `LOGISTICS` | 물류창고 | `/logistics` |

대표·관리자(`EXECUTIVE`/`ADMIN`)는 부서와 무관하게 본사(풀 CRM)로 본다.

본사 직원은 로그인 후 **회사 모드 / 개인 모드**를 고른다 (`app/choose-mode`, 쿠키 `app_mode`, `User.lastAppMode`). Prisma `WorkspaceScope`: `TEAM` | `PERSONAL`.

공개 회원가입은 막혀 있다. 계정은 `/admin/employees`에서만 만든다.

---

## 2. 기술 스택

| 구분 | 내용 | 위치 |
|------|------|------|
| 프레임워크 | Next.js **16.1.6** App Router, React 19 | `app/`, `package.json` |
| 언어 | TypeScript, import 별칭 `@/` → `src/` | `tsconfig.json` |
| DB | PostgreSQL + Prisma 5 | `prisma/schema.prisma` |
| DB 호스팅 | Supabase. 앱은 `DATABASE_URL`(풀러 6543), 마이그레이션은 `DIRECT_URL`(5432) | schema 주석 |
| 인증 | NextAuth v5 (Auth.js), JWT, Credentials | `src/auth.ts`, `src/auth.config.ts` |
| 실시간 | Supabase Realtime (채팅·알림) | `src/lib/supabase/` |
| 저장소 | Google Drive / Vercel Blob / WebDAV(NAS) / 로컬FS | `src/lib/storage/index.ts` |
| 드라이브 탐색기 | 별도 공유 폴더 + 부서 ACL | `app/drive/`, `src/lib/drive/` |
| NAS 브라우저 | 시놀로지 File Station | `app/nas-drive/`, `src/lib/nas/` |
| 푸시 | OneSignal | `src/lib/notifications/push.ts` |
| 캘린더 | Google(읽기 OAuth), 네이버(쓰기 OAuth + CalDAV 읽기), iCal보내기 | `app/api/integrations/` |
| 미리보기 | CloudConvert (HWP→PDF) | `src/lib/files/hwp-convert-job.ts` |
| AI | 기본 Gemini. OpenAI·Claude·Ollama 가능 | `src/lib/ai/`, `/ai-secretary`, `/ai-hub` |
| 배포 | Vercel, 리전 `icn1`(서울). `main` 푸시 시 자동 배포 | `vercel.json`, `AGENTS.md` |
| 테스트 | Vitest | `tests/` |
| 에디터 | BlockNote, React Flow(마인드맵), react-big-calendar | 업무·게시판·일정 |

프로덕션에서 어떤 저장소·AI 키가 켜져 있는지는 레포에 없다. `.env.example`만 옵션을 적는다.

---

## 3. 폴더 구조

```
complete-crm/
├── app/                 # 페이지 + API Route Handler
│   ├── api/             # REST (~200개 route.ts). 페이지와 1:1인 경우가 많음
│   ├── admin/           # 임원 관리 화면
│   ├── dashboard, tasks, drive, chat, leave, finance, …
│   └── (feature)/ai-hub/
├── src/                 # 앱 코드 (@/*)
│   ├── auth.ts          # NextAuth, getAppSession()
│   ├── middleware.ts    # 페이지 로그인 리다이렉트. API는 통과
│   ├── components/      # UI (app-nav, 에디터, 대시보드…)
│   ├── lib/             # 권한·드라이브·연차·저장소 등 비즈니스 로직
│   ├── actions/         # 서버 액션
│   ├── store/           # Zustand (워크스페이스)
│   └── types/
├── prisma/
│   ├── schema.prisma    # 데이터 모델 단일 원천
│   ├── migrations/
│   └── seed.ts
├── scripts/             # 백필·진단. 런타임 아님. diag-* 는 커밋하지 않는 경우가 많음
├── tests/
├── docs/                # 이 설명서, PRODUCT_KNOWLEDGE.md(인앱 AI 비서)
├── public/
├── AGENTS.md            # 에이전트 배포 규칙
└── .env.example
```

루트의 `lib/`, `components/`는 쓰지 않는다. 코드는 `src/`만 본다.

---

## 4. 역할·권한·조직

### 4.1 Role (`prisma/schema.prisma`)

| Role | 의미 | 대표 권한 |
|------|------|-----------|
| `USER` | 일반 직원 | 기본 기능 |
| `TEAM_LEAD` | 팀장 | 휴가 1차 승인, 자금 결재 |
| `CENTER_CHIEF` | 센터장 | CS 자금 2차 결재 |
| `EXECUTIVE` | 대표/임원 | 휴가 2차, 직원·회사 관리, 거의 전부 |
| `ADMIN` | 레거시 | 코드에서 대부분 `EXECUTIVE`와 동일 (`src/lib/role-access.ts`) |

마스터 계정은 **역할이 아니라 이메일**이다 (`src/lib/master-account.ts`, 기본 `admin@complete.co.kr`).

### 4.2 기능 권한 키 (`src/lib/permissions.ts`)

예: `dashboard`, `tasks`, `leave`, `leave_approve`, `leave_approve_final`, `finance_request`, `finance_approve`, `finance_transfer`, `employee_manage`, `board`, `announcements` …

해석 순서 (`src/lib/permissions-resolve.ts`):

1. `User.permissions` JSON (개인 지정)
2. `Position.permissions` (직책 템플릿, `User.position` 이름 매칭)
3. 조직 기본값 (CS팀, 물류)
4. Role 기본값 (`DEFAULT_BY_ROLE`)

**세션 JWT의 `permissions`는 이미 해석된 값이다.** DB의 `User.permissions`만 보고 판단하면 직책 템플릿이 빠진다.

### 4.3 조직별 화면 잠금

미들웨어가 CS/물류 URL을 막지는 **않는다**. 네비·페이지 리다이렉트가 막는다 (`src/lib/org-access.ts`, `src/components/app-nav.tsx`).

- CS 허용 예: `/cs-tools`, `/cs-lounge`, `/cs-clients`, `/cs-org`, `/leave`, `/schedule`, `/finance/requests`
- 물류 허용 예: `/logistics`, `/leave`, `/finance/requests`, `/admin/company`, `/profile`
- CS팀(`department === "CS팀"`)은 대시보드·업무·견적·게시판·공지를 기본으로 숨긴다 (`src/lib/cs-team-permissions.ts`)

### 4.4 드라이브 폴더 ACL (`src/lib/drive/folder-access.ts`)

탐색기 공유 드라이브 섹션 규칙 예:

- `01_회사공통`, `02_프로젝트` — 전사
- `03_부서별` — 부서 매핑
- `04_영업자료` — 임원
- `05_마케팅자료` — 마케팅

`DriveTeamShare`로 CRM 사용자를 Google 폴더 ACL에 동기화한다 (`app/admin/drive-shares`, `src/lib/drive/team-share-sync.ts`).

---

## 5. 화면·도메인 지도

경로 ↔ 코드 위치를 한 줄로 적는다.

### 인증
- `/login` — `app/login`
- NextAuth — `app/api/auth/[...nextauth]`, `src/auth.ts`
- 세션 헬퍼 — **`getAppSession()`** (`src/auth.ts`). API·RSC에서 이걸 쓴다.

### 본사 업무
- `/dashboard` — 출퇴근 요약, 공지, 연차, 브리프
- `/tasks`, `/tasks/[id]` — 업무 목록/보드/마인드맵(React Flow). 소프트삭제 `deletedAt`
- `/projects/[id]` — 브랜드 하위 프로젝트
- `/my-project` — 내 현재 프로젝트
- `/notes` — Keep 스타일 메모 (`UserNote`)
- `/company`, `/personal` — 스킬트리 시각화
- `/trash` — 업무·프로젝트 복구. 30일 후 Cron 영구삭제

### 소통
- `/board` — 자료·교육·자유·익명 (`BoardPost.category`)
- `/announcements` — 공지·투표
- `/chat`, `/chat/[id]` — 1:1·그룹, Supabase Realtime
- `/notifications` — 인앱 알림 + OneSignal 푸시

### 파일
- `/drive` — Google Drive 탐색기 (`app/drive/drive-page-client.tsx`)
- `/drive/trash`, `/drive/activity`
- `/nas-drive` — 시놀로지 File Station (업로드 WebDAV와 별개)
- 본문/채팅 첨부는 `/api/upload` (탐색기와 다른 파이프라인)

### 인사
- `/leave` — 연차 신청. 근로기준법 §60·§61 발생 엔진 `src/lib/leave/`
- `/hr` — 근태+연차 탭
- `/admin/attendance`, `/admin/attendance-import` — 기록기 엑셀
- `/cs-tools/attendance`, `/away`, `/idle` — CS 출퇴근·이석·유휴
- 휴가 상태: `PENDING` → `TEAM_LEAD_APPROVED` → `APPROVED`

### 자금·견적
- `/finance/requests` — 이체 요청. 상태: `PENDING` → (CS면 `CENTER_CHIEF_APPROVED`) → `EXECUTIVE_PENDING` → `TEAM_LEAD_APPROVED`(대표 승인 후 이체 대기) → `COMPLETED`
- `/finance/vendors` — 거래처
- 조회 범위: `src/lib/finance-scope.ts`
- `/quotations` — 견적. `Project`와 연결

### CS
- `/cs-tools` — 링크 허브, 근태, 생일, 공지
- `/cs-clients` — 고객사·브랜드 배정
- `/cs-org` — 조직도·월별 배정
- `/cs-lounge` — CS 내부 라운지(공지/익명)

### 일정·AI
- `/schedule` — 내부 일정 + 프로젝트 마감 + 공휴일(`src/lib/korean-holidays.ts`)
- Google/네이버 연동 — `app/api/integrations/`
- `/ai-secretary` — 대화형 비서 (날짜 스레드는 KST)
- `/ai-hub` — 용도별 에이전트 (CS응대, 카피, 영상, 비교, 이미지, 코드)

### 관리
- `/admin` — 임원 허브
- `/admin/employees` — 직원 CRUD·엑셀
- `/admin/permissions` — 기능 권한
- `/admin/departments-positions` — 부서·직책
- `/admin/company` — `CompanyInfo` 싱글톤 (로고, 직인, 연차 정책, 이체담당)
- `/admin/drive-shares` — Drive ACL 규칙
- `/admin/logs` — Daily Report
- `/profile` — 내 정보·푸시

---

## 6. 데이터 모델 뼈대

원천: `prisma/schema.prisma`. 필드 전부 외우지 말고 관계만 기억한다.

```
User ── Role, department, position, permissions JSON
     ├── Attendance / AttendanceRecord / AwayLog
     ├── LeaveRequest ── LeaveAccrual(FIFO) / LeaveBalance
     ├── Task (담당자, 작성자, projectId, scope) ── Project ── Brand
     ├── Schedule ── ScheduleInvite
     ├── Chat ── ChatMessage
     ├── BoardPost / Announcement
     ├── Notification / OneSignalSubscription
     ├── PaymentRequest ── Vendor
     ├── Quotation ── QuotationItem, Project
     ├── DriveFile (트리) ── ProjectDriveFile / PostDriveFile / DriveTeamShare
     ├── Google/Naver 캘린더 연동
     ├── CsTool, CsClient, CsOrg*, CsLoungePost
     └── AiConversation, AiHubHistory, UserNote, DailyWorkLog

CompanyInfo (한 행) — 회사 설정
Department, Position — 조직 마스터
```

소프트삭제: `Task.deletedAt`, `Project.deletedAt`, `BoardPost.deletedAt`, `DriveFile.trashed`.  
워크스페이스: `Task.scope`, `Schedule.scope`, `BoardPost.workspaceScope`.

---

## 7. 반드시 지켜야 하는 패턴

### 인증
- `src/middleware.ts`는 **`/api/*`를 public으로 통과**시킨다. 각 `app/api/**/route.ts`에서 `getAppSession()` 없으면 누구나 호출할 수 있다.
- 비활성 계정: `User.accountDisabled`.

### 날짜
- 업무일·근태·연차·AI 비서 스레드는 **KST**. `src/lib/date-kst.ts` (`toKstYmd`, `startOfDayKst`, `todayYmdKst`).
- `new Date().toISOString().slice(0,10)`로 “오늘”을 만들지 말 것. UTC라 한국 오전 9시 전에 날짜가 하루 밀린다.

### 업로드 두 갈래
1. **콘텐츠 첨부** — `POST /api/upload` → `src/lib/storage`. 실행파일(.exe 등)만 차단. 탐색기 한도와 별개.
2. **드라이브 탐색기** — `POST /api/drive/upload-session` → 청크 `upload-chunk` → `upload-complete`. 클라이언트: `src/lib/drive/explorer-resumable-upload.ts`.

Office 파일: 브라우저/한컴이 `.docx`를 `application/haansoftdocx`로 보내면 Google이 다운로드만 한다. 확장자로 MIME을 고친다 (`src/lib/upload-policy.ts` `inferUploadMimeType`, `src/lib/drive/google-office-open.ts`).

폴더 ID를 섞지 말 것:
- `GOOGLE_DRIVE_FOLDER_ID` — 채팅/본문 등 업로드 대상
- `GOOGLE_DRIVE_EXPLORER_FOLDER_ID` — `/drive` 탐색기 루트 (`src/lib/drive/explorer-root.ts`)

`STORAGE_PROVIDER=local`은 Vercel에서 깨진다(읽기전용 FS).

### 배포 (`AGENTS.md`)
- 끝낸 작업은 `npx tsc --noEmit` + `npx next build` 후, 바꾼 파일만 커밋하고 `main`에 푸시.
- `cookies.txt`, `build-out.txt`, `*-report.txt` 커밋 금지.
- Prisma 스키마를 바꿨으면 푸시 전 `npm run db:migrate`.
- 커밋 메시지: 한국어, 제목 한 줄 + 본문에 이유.

Vercel Cron (`vercel.json`): 업무 아카이브, 고아/정체 업무, 마감 알림, 다이제스트, 30일 하드삭제, 연차 발생/소멸, Drive 동기화·미리보기 권한 회수. `CRON_SECRET` Bearer.

### 클라이언트
- 워크스페이스 전환: 헤더 `x-workspace: TEAM|MY` (`src/lib/workspace-fetch-headers.ts`).
- 목록 데이터는 SWR을 쓰는 화면이 많다.

---

## 8. 자주 건드리는 파일

| 하고 싶은 일 | 파일 |
|--------------|------|
| 스키마 | `prisma/schema.prisma` |
| 로그인·세션 | `src/auth.ts` |
| 권한 키 | `src/lib/permissions.ts` |
| 권한 해석 | `src/lib/permissions-resolve.ts` |
| 본사/CS/물류 라우팅 | `src/lib/org-access.ts` |
| 사이드바 | `src/components/app-nav.tsx` |
| Drive 폴더 권한 | `src/lib/drive/folder-access.ts` |
| 저장소 선택 | `src/lib/storage/index.ts` |
| 업로드 MIME | `src/lib/upload-policy.ts` |
| 연차 계산 | `src/lib/leave/` |
| KST | `src/lib/date-kst.ts` |
| 미들웨어 | `src/middleware.ts` |
| 환경변수 목록 | `.env.example` |
| 인앱 AI가 읽는 제품 설명 | `docs/PRODUCT_KNOWLEDGE.md` (기능 사용법. 이 문서와 역할이 다름) |

---

## 9. 없는 것 / 헷갈리기 쉬운 것

- `/documents` + `/api/files` — 로컬 디스크 브라우저. Vercel에서는 쓸모 없다.
- `/logistics` — 화면은 있으나 네비에 “준비중” 힌트가 있을 수 있다. 기능을 새로 지어 넣지 말 것.
- 일일 업로드 5GB 한도는 **제거됨**. `UserDailyUploadUsage` 테이블은 스키마에 남을 수 있으나 앱이 더 이상 한도로 쓰지 않는다.
- AI 비서가 읽는 지식은 `docs/PRODUCT_KNOWLEDGE.md`다. **구조·아키텍처는 이 파일**이다.

---

## 10. 새 기능을 넣을 때 체크

1. 어느 조직(HQ/CS/LOGISTICS) 화면인가? `org-access` 허용 경로에 넣어야 하는가?
2. 기능 키를 `FEATURE_LABELS`에 추가하고 역할 기본값·직책 템플릿을 정했는가?
3. API가 `getAppSession()` + 권한 체크를 하는가?
4. 날짜가 있으면 KST인가?
5. Drive/업로드면 폴더 ID·MIME 파이프라인을 섞지 않았는가?
6. `WorkspaceScope`가 필요한 데이터인가?
