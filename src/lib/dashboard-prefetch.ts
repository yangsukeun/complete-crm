import { unstable_cache } from "next/cache";
import prisma from "@/lib/prisma";
import { addDays } from "date-fns";
import type { DashboardSalesStats } from "@/lib/dashboard-sales";
import { getDashboardSalesStats } from "@/lib/dashboard-sales";
import { startOfDayKst } from "@/lib/date-kst";

/** 대시보드 공지 카드 — /api/announcements GET과 동일한 매핑 */
export type DashboardAnnouncementItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  createdByName: string;
  createdByPosition: string | null;
};

const fetchAnnouncementsForDashboardCached = unstable_cache(
  async (): Promise<DashboardAnnouncementItem[]> => {
    const list = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        pollData: true,
        createdBy: { select: { name: true, position: true } },
      },
    });

    return list.map((a) => {
      return {
        id: a.id,
        title: a.title,
        content: a.content,
        createdAt: a.createdAt.toISOString(),
        createdByName: a.createdBy?.name ?? "삭제된 사용자",
        createdByPosition: a.createdBy?.position ?? null,
      };
    });
  },
  ["dashboard-announcements"],
  { revalidate: 45 }
);

/** userId는 API 시그니처 호환용(목록은 워크스페이스 공통). */
export async function getAnnouncementsForDashboard(_userId: string): Promise<DashboardAnnouncementItem[]> {
  return fetchAnnouncementsForDashboardCached();
}

/** 다음 7일 일정 프리뷰 (대시보드 카드·목록) — 사용자별 짧은 캐시로 반복 방문 시 DB 완화 */
export async function getUpcomingSchedulesForDashboard(userId: string, take = 5) {
  return unstable_cache(
    async () => {
      const now = new Date();
      const weekEnd = addDays(now, 7);
      return prisma.schedule.findMany({
        where: {
          userId,
          startTime: { gte: now, lte: weekEnd },
        },
        orderBy: { startTime: "asc" },
        take,
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          isAllDay: true,
        },
      });
    },
    ["dashboard-upcoming-schedules", userId, String(take)],
    { revalidate: 30 }
  )();
}

const userTaskSelect = {
  id: true,
  title: true,
  dueDate: true,
  isCompleted: true,
  status: true,
  createdBy: { select: { name: true, position: true } },
} as const;

const adminTaskSelect = {
  id: true,
  title: true,
  dueDate: true,
  isCompleted: true,
  status: true,
  priority: true,
  assignedTo: { select: { name: true, position: true } },
} as const;

export type DashboardUserTask = {
  id: string;
  title: string;
  dueDate: Date;
  isCompleted: boolean;
  status: string;
  createdBy: { name: string; position: string | null } | null;
};

export type DashboardAdminTask = {
  id: string;
  title: string;
  dueDate: Date;
  isCompleted: boolean;
  status: string;
  priority: string;
  assignedTo: { name: string; position: string | null };
};

/** 직원: 미완료 할당 업무 미리보기 + KST 기준 마감일 당일/지난 건수 */
export async function getUserTasksForDashboard(userId: string, previewTake = 10) {
  const sod = startOfDayKst(new Date());
  const endTodayKst = new Date(sod.getTime() + 24 * 60 * 60 * 1000 - 1);

  const assigneeVisible = {
    OR: [{ assignedToId: userId }, { assignees: { some: { userId } } }],
  };

  const [list, dueSoonCount] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null, isCompleted: false, ...assigneeVisible },
      orderBy: { dueDate: "asc" },
      take: previewTake,
      select: userTaskSelect,
    }),
    prisma.task.count({
      where: {
        deletedAt: null,
        isCompleted: false,
        dueDate: { lte: endTodayKst },
        ...assigneeVisible,
      },
    }),
  ]);

  return { list: list as DashboardUserTask[], dueSoonCount };
}

/** 관리자: 내가 만든 업무 (진행률·목록용, 전체 tasks?all=1 수준의 부하 없음) */
export async function getAdminTasksForDashboard(userId: string, take = 100) {
  return prisma.task.findMany({
    where: { deletedAt: null, createdById: userId },
    select: adminTaskSelect,
    orderBy: { dueDate: "asc" },
    take,
  }) as Promise<DashboardAdminTask[]>;
}

export type CompanyDashboardPrefetch = {
  announcements: DashboardAnnouncementItem[];
  salesStats: DashboardSalesStats;
  upcomingSchedules: Awaited<ReturnType<typeof getUpcomingSchedulesForDashboard>>;
};

/** 관리자 대시보드: 공지·매출·일정·내가 만든 업무 프리뷰를 한 번에 */
export async function prefetchCompanyDashboardAdmin(userId: string) {
  const [announcements, salesStats, upcomingSchedules, adminTasks] = await Promise.all([
    getAnnouncementsForDashboard(userId),
    getDashboardSalesStats(),
    getUpcomingSchedulesForDashboard(userId),
    getAdminTasksForDashboard(userId),
  ]);
  return { announcements, salesStats, upcomingSchedules, adminTasks };
}

/** 직원 대시보드: 공지·매출·일정·할당 업무 프리뷰를 한 번에 */
export async function prefetchCompanyDashboardUser(userId: string) {
  const [announcements, salesStats, upcomingSchedules, userTaskBundle] = await Promise.all([
    getAnnouncementsForDashboard(userId),
    getDashboardSalesStats(),
    getUpcomingSchedulesForDashboard(userId),
    getUserTasksForDashboard(userId),
  ]);
  return {
    announcements,
    salesStats,
    upcomingSchedules,
    myTasks: userTaskBundle.list,
    dueSoonCount: userTaskBundle.dueSoonCount,
  };
}

/**
 * 회사 모드 대시보드용 공통 데이터만 (업무 제외)
 * @deprecated prefetchCompanyDashboardUser/Admin 사용 권장
 */
export async function prefetchCompanyDashboardShared(userId: string): Promise<CompanyDashboardPrefetch> {
  const [announcements, salesStats, upcomingSchedules] = await Promise.all([
    getAnnouncementsForDashboard(userId),
    getDashboardSalesStats(),
    getUpcomingSchedulesForDashboard(userId),
  ]);
  return { announcements, salesStats, upcomingSchedules };
}
