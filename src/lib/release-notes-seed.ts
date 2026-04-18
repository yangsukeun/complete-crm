import type { PrismaClient } from "@prisma/client";

const SEED = [
  {
    version: "v0.10.0",
    releasedAt: new Date("2025-06-15T09:00:00.000Z"),
    title: "성능 최적화 완료",
    category: "feature",
    bodyMd: `요청 수 **226건 → 8건** 수준으로 줄이고, 주요 화면 로딩 **약 5분 → 1초 내외**로 개선했습니다.

- API·SWR 캐시 정리
- 불필요한 클라이언트 재조회 제거`,
  },
  {
    version: "v0.11.0",
    releasedAt: new Date("2025-09-10T09:00:00.000Z"),
    title: "마인드맵 3단 뷰 + 프로젝트 분리",
    category: "feature",
    bodyMd: `**전체 조감도 · 프로젝트별 · 미분류** 뷰를 도입하고, 프로젝트 카드와 업무 트리를 명확히 나눴습니다.`,
  },
  {
    version: "v0.12.0",
    releasedAt: new Date("2025-11-20T09:00:00.000Z"),
    title: "완료 업무 자동 접힘·아카이브",
    category: "feature",
    bodyMd: `완료 후 **3일** 경과 시 접힘, **30일** 경과 시 아카이브로 이동합니다. 검색은 아카이브 포함 전체에서 동작합니다.`,
  },
  {
    version: "v0.13.0",
    releasedAt: new Date("2026-01-08T09:00:00.000Z"),
    title: "업무 누락 방지 자동 알림 4종",
    category: "feature",
    bodyMd: `고아 업무(24h), 정체(7일), 마감 D-3/D-1/D-day, 아침 다이제스트 등 **자동 알림**을 강화했습니다.`,
  },
  {
    version: "v0.14.0",
    releasedAt: new Date("2026-04-05T09:00:00.000Z"),
    title: "소프트 삭제 + 휴지통 + 변경 이력",
    category: "feature",
    bodyMd: `삭제 후 **30일** 휴지통 보관, **변경 이력** 탭, 마인드맵 **되돌리기(직전 1버전)** 등을 추가했습니다.`,
  },
  {
    version: "v0.15.0",
    releasedAt: new Date("2026-04-18T09:00:00.000Z"),
    title: "도움말 센터 오픈",
    category: "feature",
    bodyMd: `DB 기반 **도움말 허브**, 온보딩 투어, **릴리즈 노트**를 한곳에서 볼 수 있습니다.`,
  },
];

export async function seedReleaseNotes(prisma: PrismaClient): Promise<void> {
  for (const row of SEED) {
    await prisma.releaseNote.upsert({
      where: { version: row.version },
      create: row,
      update: {
        releasedAt: row.releasedAt,
        title: row.title,
        bodyMd: row.bodyMd,
        category: row.category,
      },
    });
  }
  console.log(`릴리즈 노트 시드: ${SEED.length}건 upsert 완료`);
}
