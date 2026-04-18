import type { PrismaClient } from "@prisma/client";

/** 초기 도움말 문서(upsert 시 slug 기준). 배포 없이 /admin/help 에서 수정 가능 */
export const HELP_SEED_ARTICLES: Array<{
  slug: string;
  title: string;
  category: string;
  summary: string;
  bodyMd: string;
  orderIndex: number;
  isPublished: boolean;
  targetRoles: string[];
  relatedSlugs: string[];
}> = [
  {
    slug: "getting-started",
    category: "getting-started",
    title: "컴플리트 CRM 시작하기",
    summary: "로그인부터 대시보드·주요 메뉴·프로필까지 처음 쓰는 분을 위한 안내입니다.",
    orderIndex: 0,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["project-vs-task", "faq-common-issues"],
    bodyMd: `## 로그인

회사에서 안내한 **이메일·비밀번호**로 로그인합니다. 최초 로그인 시 비밀번호 변경을 요청할 수 있습니다.

## 대시보드 구성

로그인 후 **대시보드**에서 오늘 일정, 알림, 주요 지표를 한눈에 볼 수 있습니다. 상단 헤더에서 **회사/개인 모드**를 전환할 수 있습니다.

## 주요 메뉴

- **업무·마인드맵**: 프로젝트별 업무를 트리·보드 형태로 관리합니다.
- **프로젝트 / 견적**: 브랜드·견적·프로젝트 단위 업무를 연결합니다.
- **일정·휴가·채팅**: 협업과 인사 기능을 사용합니다.
- **AI 허브**: 문서·이미지 등 업무 보조 에이전트를 실행합니다.

## 프로필 설정

**프로필** 메뉴에서 이름, 연락처, 알림(푸시) 설정을 확인하세요. 브라우저에서 푸시를 켜야 마감·멘션 알림을 받을 수 있습니다.

> 스크린샷은 관리자가 **도움말 관리**에서 \`/docs/images/\` 경로 이미지를 넣어 보강할 수 있습니다.`,
  },
  {
    slug: "mindmap-three-views",
    category: "mindmap",
    title: "마인드맵 3단 뷰 이해하기",
    summary: "전체 조감도, 프로젝트별 뷰, 미분류 보관함의 차이와 전환 방법을 설명합니다.",
    orderIndex: 0,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["completion-filter", "mindmap-undo"],
    bodyMd: `## 1. 전체 조감도

**프로젝트 카드** 중심으로 전체 구조를 조망합니다. 어떤 프로젝트에 업무가 몰려 있는지 빠르게 파악할 때 사용합니다.

## 2. 프로젝트별 뷰

특정 프로젝트를 선택하면 **해당 프로젝트에 속한 업무**만 마인드맵에 표시됩니다. 일일 스탠드업이나 프로젝트 단위 정리에 적합합니다.

## 3. 미분류 보관함

프로젝트에 아직 넣지 않은 업무를 **미분류** 영역에서 모아 볼 수 있습니다.

## 뷰 전환

마인드맵 상단(또는 캔버스)에서 **뷰 모드**를 바꿉니다. 선택한 뷰는 사용자별로 저장될 수 있습니다.

## URL 공유

브라우저 주소창의 URL을 그대로 복사해 동료에게 공유하면, 권한이 있는 경우 동일한 뷰 컨텍스트로 진입할 수 있습니다.

## 이미지 자리

- \`/docs/images/mindmap-overview.png\` — 전체 조감도 예시 (관리자 업로드 예정)
- \`/docs/images/mindmap-project.png\` — 프로젝트 뷰 예시 (관리자 업로드 예정)`,
  },
  {
    slug: "completion-filter",
    category: "mindmap",
    title: "완료 업무가 안 보여요",
    summary: "활성/최근 완료/아카이브 토글과 자동 접힘·30일 아카이브 규칙을 정리합니다.",
    orderIndex: 1,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["mindmap-three-views"],
    bodyMd: `## 3단 토글

1. **활성만** — 진행 중·할 일 위주로 보입니다. 방금 완료한 항목은 토글에 따라 숨을 수 있습니다.
2. **최근 7일 완료 포함** — 최근 일주일 안에 끝낸 업무를 함께 표시합니다.
3. **아카이브 포함** — 오래된 완료·아카이브 묶음까지 펼쳐 봅니다.

## 자동 접힘·아카이브

- 완료된 지 **3일**이 지난 노드는 목록에서 **자동으로 접힘** 처리되어 화면이 지저분해지지 않습니다.
- **30일**이 지나면 **아카이브** 구역으로 넘어가며, 기본 토글에서는 숨겨질 수 있습니다.

## 검색

**검색**은 아카이브에 들어간 업무까지 포함해 **항상 전 범위**에서 동작합니다. 이름으로 찾을 때는 토글과 관계없이 검색 결과를 확인하세요.`,
  },
  {
    slug: "task-orphan-prevention",
    category: "tasks",
    title: "업무 누락 방지 자동 알림",
    summary: "고아 업무, 정체 업무, 마감 D-3/D-1/D-day 및 아침 다이제스트 알림을 설명합니다.",
    orderIndex: 0,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["notifications-setup", "trash-and-restore"],
    bodyMd: `## 고아 업무 (24시간 담당 미지정)

담당자가 없는 채로 **24시간** 넘게 남아 있으면 **고아 업무**로 분류되어 알림이 발송됩니다. 빠르게 담당자를 지정하세요.

## 정체 업무 (7일 무활동)

**7일** 동안 댓글·상태·본문 등 활동이 없으면 **정체** 알림이 나갈 수 있습니다. 장기 과제는 중간 체크인 댓글을 남기는 것이 좋습니다.

## 마감 경보

- **D-3**, **D-1**, **D-day**에 맞춰 마감 임박 알림이 발송됩니다.
- 푸시가 꺼져 있으면 수신되지 않으니 **알림 설정**을 확인하세요.

## 매일 아침 다이제스트

스케줄된 **아침 다이제스트 푸시**로 오늘 마감·지연 가능성이 있는 업무를 한 번에 받아볼 수 있습니다.`,
  },
  {
    slug: "trash-and-restore",
    category: "tasks",
    title: "휴지통과 복구",
    summary: "삭제한 업무·프로젝트·댓글은 30일간 휴지통에 보관되며, 이후 시스템이 영구 삭제합니다.",
    orderIndex: 1,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["audit-log"],
    bodyMd: `## 소프트 삭제

업무·프로젝트·댓글·첨부를 삭제하면 DB에서 즉시 지워지지 않고 **삭제 시각**만 기록됩니다.

## 휴지통 (/trash)

**휴지통** 메뉴에서 최근 **30일** 이내에 삭제된 항목을 탭별로 확인할 수 있습니다. **복구**를 누르면 이전 위치로 되돌아갑니다.

## 영구 삭제 (하드 삭제)

**30일**이 지난 항목은 매일 실행되는 **정리 작업**에서 영구 삭제됩니다. 복구가 불가능하므로 중요한 데이터는 기한 내에 복구하세요.

## 첨부 파일

첨부가 클라우드에 연결된 경우, 영구 삭제 시 **스토리지 쪽 파일**도 함께 정리될 수 있습니다.`,
  },
  {
    slug: "mindmap-undo",
    category: "mindmap",
    title: "마인드맵 실수로 바꿨을 때",
    summary: "저장 직후 직전 버전 한 번만 되돌리는 방법입니다.",
    orderIndex: 2,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["mindmap-three-views"],
    bodyMd: `## 되돌리기 버튼

마인드맵 뷰 **상단 오른쪽**에 **되돌리기**가 표시될 때만 사용할 수 있습니다. 누르면 확인 후 **직전 저장본 한 번**으로 복구합니다.

## 버전은 1개만

- **직전 1버전**만 보관합니다. 여러 단계 연쇄 되돌리기는 지원하지 않습니다.
- **저장할 때마다** 그 시점의 스냅샷이 이전 버전으로 밀립니다. 자주 저장할수록 되돌리기 기준점이 갱신됩니다.

## 주의

되돌린 뒤에는 이전에 쓰던 "현재" 데이터가 사라지므로, 필요하면 되돌리기 전에 한 번 더 저장해 두세요.`,
  },
  {
    slug: "audit-log",
    category: "tasks",
    title: "업무 변경 이력 보기",
    summary: "상세 화면의 변경 이력 탭에서 상태·담당·마감 등 수정 기록을 확인합니다.",
    orderIndex: 2,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["trash-and-restore"],
    bodyMd: `## 위치

업무 **상세** 패널 또는 페이지에서 **「변경 이력」** 탭을 엽니다.

## 무엇이 기록되나요?

다음 필드가 바뀔 때 **누가·언제·무엇을** 바꿨는지 기록됩니다.

- 상태, 담당자, 마감일, 프로젝트
- 아카이브, 완료 시각, 삭제(휴지통 이동) 시각 등

## 권한

**담당자** 또는 **관리자**만 열람할 수 있습니다.`,
  },
  {
    slug: "project-vs-task",
    category: "getting-started",
    title: "프로젝트와 업무의 차이",
    summary: "견적·브랜드 단위의 프로젝트와 실제 실행 단위인 업무(Task)의 관계를 정리합니다.",
    orderIndex: 1,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["getting-started", "mindmap-three-views"],
    bodyMd: `## 프로젝트 (Project)

**브랜드·견적·계약** 단위로 묶이는 큰 덩어리입니다. 예산, 기간, 산출물의 "틀"을 잡을 때 사용합니다.

## 업무 (Task)

실제로 **해야 할 일** 한 건한 건입니다. 마인드맵·보드·목록에서 다루는 대부분이 업무입니다.

## 언제 무엇을 쓰나요?

- 견적이 승인되고 팀이 붙었다 → **프로젝트**를 만들고
- 그 안에서 디자인·개발·검수 등을 쪼갠다 → **업무**로 나눕니다.

업무는 프로젝트에 연결하거나, 잠시 **미분류**로 두었다가 나중에 넣을 수 있습니다.`,
  },
  {
    slug: "ai-hub",
    category: "tasks",
    title: "AI 허브 사용법",
    summary: "문서·이미지·번역 등 여러 에이전트를 한곳에서 실행하는 방법입니다.",
    orderIndex: 3,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["getting-started"],
    bodyMd: `## AI 허브란?

**AI 허브** 메뉴에서 회사에 맞게 구성된 **에이전트**를 선택해 프롬프트를 입력하고 결과를 저장합니다.

## 에이전트 예시 (6종 안내)

1. **문서 요약** — 긴 회의록·기획서를 짧게 정리합니다.
2. **이메일/공문 초안** — 톤과 길이를 지정해 초안을 만듭니다.
3. **번역** — 한↔영 등 번역을 돕습니다.
4. **표·리스트 추출** — 비정형 텍스트에서 항목을 뽑습니다.
5. **코드·설명** — 간단한 스크립트나 주석 설명을 생성합니다.
6. **아이디어 확장** — 브레인스토밍용 질문·각도를 제안합니다.

> 실제 노출되는 에이전트 이름은 배포 설정에 따라 다를 수 있습니다. 화면에 표시된 카드를 기준으로 선택하세요.`,
  },
  {
    slug: "notifications-setup",
    category: "notifications",
    title: "푸시 알림 설정",
    summary: "브라우저 권한, OneSignal 구독, 어떤 일이 알림으로 오는지 안내합니다.",
    orderIndex: 0,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["task-orphan-prevention"],
    bodyMd: `## 브라우저 권한

첫 알림 요청 시 브라우저에서 **허용**을 선택해야 합니다. 차단했다면 주소창 왼쪽 자물쇠 아이콘에서 알림을 다시 허용하세요.

## OneSignal 구독

앱은 **OneSignal**을 통해 웹 푸시를 보냅니다. 로그인 후 안내에 따라 구독이 완료되었는지 확인하세요. 시크릿 모드에서는 제한될 수 있습니다.

## 알림이 오는 경우 (예시)

- 업무 배정·멘션·댓글
- 마감 임박·고아/정체 업무
- 휴가 승인 단계, 공지 등

**프로필** 또는 **알림** 설정에서 방해 금지 시간 등을 조정할 수 있는 경우가 있습니다.`,
  },
  {
    slug: "admin-user-management",
    category: "admin",
    title: "직원 등록과 권한",
    summary: "관리자 전용: 직원 계정 생성과 USER / TEAM_LEAD / EXECUTIVE / ADMIN 역할 차이.",
    orderIndex: 0,
    isPublished: true,
    targetRoles: ["ADMIN"],
    relatedSlugs: ["getting-started"],
    bodyMd: `## 직원 등록

내부 정책에 따라 **관리 메뉴** 또는 개발용 **\`/debug-push\`** 화면에서 테스트 계정·기기 등록을 진행할 수 있습니다. 운영 환경에서는 **직원 관리**에서 공식적으로 초대하세요.

## 역할(Role) 요약

| 역할 | 설명 |
|------|------|
| **USER** | 일반 업무·일정·채팅 등 기본 기능 |
| **TEAM_LEAD** | 팀 단위 승인·일부 관리 기능 |
| **EXECUTIVE** | 경영 관점 승인·회사 단위 조회 |
| **ADMIN** | 시스템·직원·도움말 등 넓은 관리 권한 |

세부 메뉴는 **기능 권한** 설정과 겹칠 수 있으므로, 변경 전에 담당자와 합의하세요.`,
  },
  {
    slug: "faq-common-issues",
    category: "getting-started",
    title: "자주 묻는 질문",
    summary: "로그인, 푸시, 파일 업로드 등 자주 겪는 문제와 점검 순서입니다.",
    orderIndex: 2,
    isPublished: true,
    targetRoles: [],
    relatedSlugs: ["notifications-setup", "getting-started"],
    bodyMd: `## 로그인이 안 돼요

1. 이메일·비밀번호 대소문자 확인
2. **비밀번호 재설정** 링크 사용
3. 회사 SSO/방화벽 정책 문의

## 푸시가 안 와요

1. 브라우저 알림 **허용** 여부
2. **OneSignal** 구독 상태(로그아웃 후 재로그인)
3. 집중 모드·방해 금지 OS 설정

## 파일 업로드가 안 돼요

1. 파일 크기·확장자 제한
2. 네트워크·VPN 차단 여부
3. 클라우드(드라이브) 연동 계정 권한

그래도 해결되지 않으면 **관리자**에게 스크린샷과 함께 문의하세요.`,
  },
];

export async function seedHelpArticles(prisma: PrismaClient): Promise<void> {
  for (const row of HELP_SEED_ARTICLES) {
    await prisma.helpArticle.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        title: row.title,
        category: row.category,
        summary: row.summary,
        bodyMd: row.bodyMd,
        orderIndex: row.orderIndex,
        isPublished: row.isPublished,
        targetRoles: row.targetRoles,
        relatedSlugs: row.relatedSlugs,
      },
      update: {
        title: row.title,
        category: row.category,
        summary: row.summary,
        bodyMd: row.bodyMd,
        orderIndex: row.orderIndex,
        isPublished: row.isPublished,
        targetRoles: row.targetRoles,
        relatedSlugs: row.relatedSlugs,
      },
    });
  }
  console.log(`도움말 시드: HelpArticle ${HELP_SEED_ARTICLES.length}건 upsert 완료`);
}

/** 온보딩 메인 투어 5단계 (UserTourProgress는 시드하지 않음) */
export const ONBOARDING_MAIN_TOUR_KEY = "onboarding-main";

export async function seedOnboardingTourSteps(prisma: PrismaClient): Promise<void> {
  const steps = [
    {
      tourKey: ONBOARDING_MAIN_TOUR_KEY,
      orderIndex: 0,
      targetSelector: '[data-tour="mindmap-mode-selector"]',
      title: "마인드맵 뷰",
      bodyMd:
        "마인드맵엔 3가지 뷰가 있어요. 전체 → 프로젝트별 → 미분류 순서로 보세요.",
      placement: "bottom",
      route: "/tasks",
    },
    {
      tourKey: ONBOARDING_MAIN_TOUR_KEY,
      orderIndex: 1,
      targetSelector: '[data-tour="project-card"]',
      title: "프로젝트 카드",
      bodyMd: "프로젝트 카드를 클릭하면 해당 프로젝트 업무만 볼 수 있어요.",
      placement: "bottom",
      route: "/tasks",
    },
    {
      tourKey: ONBOARDING_MAIN_TOUR_KEY,
      orderIndex: 2,
      targetSelector: '[data-tour="completion-toggle"]',
      title: "완료·아카이브",
      bodyMd: "완료된 업무는 자동으로 접혀요. 필요할 땐 여기서 펼쳐보세요.",
      placement: "bottom",
      route: "/tasks",
    },
    {
      tourKey: ONBOARDING_MAIN_TOUR_KEY,
      orderIndex: 3,
      targetSelector: '[data-tour="trash-list"]',
      title: "휴지통",
      bodyMd: "삭제한 업무는 30일간 여기에 보관돼요. 언제든 복구 가능.",
      placement: "top",
      route: "/trash",
    },
    {
      tourKey: ONBOARDING_MAIN_TOUR_KEY,
      orderIndex: 4,
      targetSelector: '[data-tour="mindmap-undo"]',
      title: "되돌리기",
      bodyMd: "마인드맵을 실수로 바꿨다면 '되돌리기' 버튼을 누르세요.",
      placement: "bottom",
      route: "/tasks?mindmap=all",
    },
  ];

  for (const s of steps) {
    const existing = await prisma.helpTourStep.findFirst({
      where: { tourKey: s.tourKey, orderIndex: s.orderIndex },
      select: { id: true },
    });
    if (existing) {
      await prisma.helpTourStep.update({
        where: { id: existing.id },
        data: {
          targetSelector: s.targetSelector,
          title: s.title,
          bodyMd: s.bodyMd,
          placement: s.placement,
          route: s.route,
        },
      });
    } else {
      await prisma.helpTourStep.create({ data: s });
    }
  }
  console.log(`도움말 시드: HelpTourStep onboarding-main ${steps.length}건 upsert 완료`);
}
