import { redirect } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import { Calendar, ListTodo, Users, ClipboardList, Target, CalendarClock, Link2, Building2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { startOfDayKst, formatKstHm } from "@/lib/date-kst";
import { ko } from "date-fns/locale";
import prisma from "@/lib/prisma";
import { authWithTimeout } from "@/lib/auth-safe";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { formatUserName } from "@/lib/utils";
import { getCurrentLeaveCalendarYearKst } from "@/lib/leave";
import { calculateLeavePool } from "@/lib/leave/calculate-pool";
import {
  prefetchCompanyDashboardAdmin,
  prefetchCompanyDashboardUser,
} from "@/lib/dashboard-prefetch";
import { PageHeadline } from "@/components/page-headline";
import { Badge } from "@/components/ui/badge";
import { canPostAnnouncement } from "@/lib/role-access";
import { canSeeCsToolsDashboardCard } from "@/lib/cs-tools-access";
import { canManageCsClients, csClientNavDescription, csClientNavLabel } from "@/lib/cs-client-access";
import { homePathForOrg, resolveOrgUnit } from "@/lib/org-access";

const DashboardAttendance = dynamic(
  () => import("@/components/dashboard-attendance").then((m) => m.DashboardAttendance),
  { ssr: true, loading: () => <div className="h-14 w-full max-w-md animate-pulse rounded-lg bg-muted/40" /> }
);
const DashboardAnnouncements = dynamic(
  () => import("@/components/dashboard-announcements").then((m) => m.DashboardAnnouncements),
  { ssr: true, loading: () => <div className="h-32 animate-pulse rounded-lg bg-muted/30" /> }
);
const DashboardTodayBrief = dynamic(
  () => import("@/components/dashboard-today-brief").then((m) => m.DashboardTodayBrief),
  { ssr: true, loading: () => <div className="h-28 animate-pulse rounded-lg bg-muted/40" /> }
);

export default async function DashboardPage() {
  const session = await authWithTimeout();
  if (!session?.user?.id) redirect("/login");

  let department = session.user.department ?? null;
  if (department == null || department === "") {
    try {
      const row = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { department: true },
      });
      department = row?.department ?? null;
    } catch {
      /* JWT 부서만 사용 */
    }
  }
  const org = resolveOrgUnit({ role: session.user.role, department });
  if (org !== "HQ") {
    redirect(homePathForOrg(org));
  }

  // Hydration 불일치 방지: 클라이언트 컴포넌트(Date.now 등) 기준 시각을 SSR에서 고정 전달
  const nowMs = Date.now();

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company" && appMode !== "personal") {
    redirect("/choose-mode");
  }
  const isCompanyMode = appMode === "company";

  const role = session.user.role ?? "USER";
  const isAdmin = role === "EXECUTIVE" || role === "ADMIN";
  const canCreateAnnouncement = canPostAnnouncement(role);
  const todayStart = startOfDayKst(new Date());

  const meDept = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { department: true },
  });
  const showCsToolsCard = canSeeCsToolsDashboardCard({
    role,
    department: meDept?.department,
  });
  const manageClients = canManageCsClients({
    role,
    department: meDept?.department,
  });

  // 개인 모드: 연차/출퇴근 없이 일정·업무·목표만
  if (!isCompanyMode) {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    const [myTasks, upcomingSchedules] = await Promise.all([
      prisma.task.findMany({
        where: {
          deletedAt: null,
          isCompleted: false,
          OR: [
            { assignedToId: session.user.id },
            { assignees: { some: { userId: session.user.id } } },
          ],
        },
        orderBy: { dueDate: "asc" },
        take: 10,
        select: {
          id: true,
          title: true,
          dueDate: true,
          isCompleted: true,
          status: true,
        },
      }),
      prisma.schedule.findMany({
        where: {
          userId: session.user.id,
          startTime: { gte: now, lte: weekEnd },
        },
        orderBy: { startTime: "asc" },
        take: 5,
      }),
    ]);
    return (
      <div className="flex flex-col gap-8 p-4 md:p-6">
        <PageHeadline
          title={`안녕하세요, ${session.user.name ?? session.user.email}님`}
          description="개인 모드 — 내 일정·할 일만 간단히 관리합니다."
        />
        <DashboardTodayBrief />
        {/* 디자인 2단계: 대시보드에서 숨김 (페이지·API 유지) — CS 링크 허브 */}
        {false && showCsToolsCard && (
          <Link
            href="/cs-tools"
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Link2 className="size-5" />
                <span className="text-sm font-medium text-foreground">CS 링크 허브</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">상담·번역·문서 등 외부 도구 바로가기</p>
            </div>
            <span className="text-primary shrink-0 text-sm font-medium">열기 →</span>
          </Link>
        )}
        <Link
          href="/tasks"
          className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <ListTodo className="size-5" />
            <span className="text-sm">프로젝트</span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{myTasks.length}건</p>
          <p className="text-muted-foreground text-sm">미완료 할 일</p>
          <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
            프로젝트 목록 →
          </span>
        </Link>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-5 opacity-90">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="size-5" />
              <span className="text-sm">남은 연차</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">—</p>
            <p className="text-muted-foreground text-sm">회사 모드에서 확인</p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="size-5" />
              <span className="text-sm">목표</span>
            </div>
            <p className="mt-2 font-semibold">이번 달 목표</p>
            <p className="text-muted-foreground text-sm">
              미완료 프로젝트 {myTasks.length}건 완료하기
            </p>
          </div>
        </div>
        {/* 디자인 2단계: 대시보드에서 숨김 — 일정 바로가기 카드 (/schedule 유지) */}
        {false && (
          <Link
            href="/schedule"
            className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-5" />
              <span className="text-sm">일정</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{upcomingSchedules.length}건</p>
            <p className="text-muted-foreground text-sm">다음 7일 일정</p>
            <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
              일정표 →
            </span>
          </Link>
        )}
        {false && upcomingSchedules.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Calendar className="size-5" />
              다가오는 일정
            </h2>
            <ul className="space-y-2">
              {upcomingSchedules.map((s: any) => (
                <li key={s.id}>
                  <Link
                    href="/schedule"
                    className="flex items-center gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex-1 font-medium">{s.title}</span>
                    <span className="text-muted-foreground text-sm">
                      {format(new Date(s.startTime), "M/d (EEE) HH:mm", { locale: ko })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/schedule" className="text-primary mt-2 inline-block text-sm font-medium hover:underline">
              전체 일정 →
            </Link>
          </section>
        )}
        {false && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/schedule"
            className="flex items-center gap-4 rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
          >
            <Calendar className="size-10 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">내 일정</h2>
              <p className="text-muted-foreground text-sm">일정을 확인하고 관리하세요.</p>
            </div>
          </Link>
          <Link
            href="/tasks"
            className="flex items-center gap-4 rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
          >
            <ListTodo className="size-10 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">내 할 일</h2>
              <p className="text-muted-foreground text-sm">미완료 {myTasks.length}건</p>
            </div>
          </Link>
        </div>
        )}
      </div>
    );
  }

  if (isAdmin) {
    const year = getCurrentLeaveCalendarYearKst();

    const [
      adminUser,
      employeeCount,
      todayAttendances,
      adminTodayAttendance,
      adminLeaveBalance,
      dashPrefetch,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { joinDate: true },
      }),
      prisma.user.count({ where: { role: "USER" } }),
      prisma.attendance.findMany({
        where: { date: todayStart },
        include: { user: { select: { name: true, department: true, position: true } } },
      }),
      prisma.attendance.findUnique({
        where: { userId_date: { userId: session.user.id, date: todayStart } },
      }),
      (async () => {
        try {
          return await prisma.leaveBalance.findUnique({
            where: { userId_year: { userId: session.user.id, year } },
          });
        } catch (e) {
          console.error("[dashboard] leaveBalance fetch:", e);
          return null;
        }
      })(),
      prefetchCompanyDashboardAdmin(session.user.id),
    ]);

    const {
      announcements: announcementsFallback,
      adminTasks: tasksCreatedByMe,
    } = dashPrefetch;

    const adminPool = await calculateLeavePool(session.user.id, new Date());
    const annualTotal = adminPool.displayGranted;

    const completedTasks = tasksCreatedByMe.filter((t: any) => t.isCompleted);
    const progressPercent =
      tasksCreatedByMe.length > 0
        ? Math.round((completedTasks.length / tasksCreatedByMe.length) * 100)
        : 0;
    const carryOver = adminLeaveBalance?.annualCarryOver ?? 0;
    const used = adminLeaveBalance?.annualUsed ?? 0;
    const manual = adminLeaveBalance?.manualDeduction ?? 0;
    const totalLeave = adminPool.available + used + manual;
    const remaining = adminPool.available;
    const incompleteCount = tasksCreatedByMe.filter((t: any) => !t.isCompleted).length;

    return (
      <div className="flex flex-col gap-8 p-4 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PageHeadline
            title={`안녕하세요, ${session.user.name ?? session.user.email}님`}
            description="관리자 대시보드 — 공지·프로젝트·직원 현황을 한눈에 볼 수 있습니다."
          />
          <DashboardAttendance
            initial={
              adminTodayAttendance
                ? {
                    id: adminTodayAttendance.id,
                    checkIn: adminTodayAttendance.checkIn?.toISOString() ?? null,
                    checkOut: adminTodayAttendance.checkOut?.toISOString() ?? null,
                    date: adminTodayAttendance.date.toISOString(),
                  }
                : null
            }
          />
        </div>

        <section>
          <DashboardAnnouncements
            canCreate={canCreateAnnouncement}
            fallbackData={announcementsFallback}
            nowMs={nowMs}
          />
        </section>

        <DashboardTodayBrief />

        {showCsToolsCard && <CsClientsEntryCard canManage={manageClients} />}

        {/* 디자인 2단계: 대시보드에서 숨김 (페이지·API 유지) — CS 링크 허브 */}
        {false && showCsToolsCard && (
          <Link
            href="/cs-tools"
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Link2 className="size-5" />
                <span className="text-sm font-medium text-foreground">CS 링크 허브</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">상담·번역·문서 등 외부 도구 바로가기</p>
            </div>
            <span className="text-primary shrink-0 text-sm font-medium">열기 →</span>
          </Link>
        )}

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ListTodo className="size-5" />
            <span className="text-sm">프로젝트</span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{progressPercent}%</p>
          <p className="text-muted-foreground text-sm">
            완료 {completedTasks.length} / 전체 {tasksCreatedByMe.length}건
          </p>
          <Link href="/tasks" className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
            프로젝트 목록 →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/leave"
            className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="size-5" />
              <span className="text-sm">남은 연차</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{remaining}일</p>
            <p className="text-muted-foreground text-sm">
              사용 {used + manual} / 전체 휴가 {totalLeave}일
            </p>
            <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
              연차/근태 →
            </span>
          </Link>
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="size-5" />
              <span className="text-sm">목표</span>
            </div>
            <p className="mt-2 font-semibold">이번 달 목표</p>
            <p className="text-muted-foreground text-sm">
              미완료 프로젝트 {incompleteCount}건 완료하기
            </p>
          </div>
        </div>

        {/* 디자인 2단계: 대시보드에서 숨김 — 전체 직원 / 금일 출근 카드 */}
        {false && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-5" />
              <span className="text-sm">전체 직원</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{employeeCount}명</p>
            <Link href="/admin/employees" className="text-primary mt-1 text-sm font-medium hover:underline">
              직원 관리 →
            </Link>
          </div>
          <Link
            href="/dashboard/today-attendance"
            prefetch={false}
            className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardList className="size-5" />
              <span className="text-sm">금일 출근</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{todayAttendances.length}명</p>
            <ul className="text-muted-foreground mt-2 text-xs">
              {todayAttendances.slice(0, 3).map((a: any) => (
                <li key={a.id}>
                  {formatUserName(a.user)}
                  {a.checkIn ? ` ${formatKstHm(a.checkIn)} 출근` : ""}
                </li>
              ))}
              {todayAttendances.length > 3 && <li>외 {todayAttendances.length - 3}명</li>}
            </ul>
            <span className="text-primary mt-2 inline-block text-sm font-medium hover:underline">
              전체 목록 보기 →
            </span>
          </Link>
        </div>
        )}

        {/* 디자인 2단계: 대시보드에서 숨김 — 일정 / 프로젝트 리마인드 바로가기 */}
        {false && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/schedule"
            className="flex items-center gap-4 rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
          >
            <Calendar className="size-10 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">일정</h2>
              <p className="text-muted-foreground text-sm">캘린더에서 일정을 확인하고 관리하세요.</p>
            </div>
          </Link>
          <Link
            href="/tasks"
            className="flex items-center gap-4 rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
          >
            <ListTodo className="size-10 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">프로젝트 리마인드</h2>
              <p className="text-muted-foreground text-sm">
                직원에게 프로젝트를 지시하고 진행 상황을 확인하세요.
              </p>
            </div>
          </Link>
        </div>
        )}

      </div>
    );
  }

  // 회사 모드 · User: 일정·업무·남은 연차·목표 + 출퇴근
  const year = getCurrentLeaveCalendarYearKst();

  const [userForLeave, myTodayAttendance, leaveBalance, dashPrefetchUser] =
    await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { joinDate: true },
    }),
    prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: todayStart } },
    }),
    (async () => {
      try {
        return await prisma.leaveBalance.findUnique({
          where: { userId_year: { userId: session.user.id, year } },
        });
      } catch (e) {
        console.error("[dashboard] leaveBalance fetch:", e);
        return null;
      }
    })(),
    prefetchCompanyDashboardUser(session.user.id),
  ]);

  const {
    announcements: announcementsFallbackUser,
    myTasks,
  } = dashPrefetchUser;

  const userPool = await calculateLeavePool(session.user.id, new Date());
  const annualTotal = userPool.displayGranted;

  const carryOver = leaveBalance?.annualCarryOver ?? 0;
  const used = leaveBalance?.annualUsed ?? 0;
  const manual = leaveBalance?.manualDeduction ?? 0;
  const totalLeave = userPool.available + used + manual;
  const remaining = userPool.available;

  const isDueSoonOrOverdue = (due: Date) => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return due <= endOfToday;
  };

  return (
    <div className="flex flex-col gap-8 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title={`안녕하세요, ${session.user.name ?? session.user.email}님`}
          description="직원 대시보드 — 오늘 할 일·일정·공지를 확인합니다."
        />
        <DashboardAttendance
          initial={
            myTodayAttendance
              ? {
                  id: myTodayAttendance.id,
                  checkIn: myTodayAttendance.checkIn?.toISOString() ?? null,
                  checkOut: myTodayAttendance.checkOut?.toISOString() ?? null,
                  date: myTodayAttendance.date.toISOString(),
                }
              : null
          }
        />
      </div>

      <section>
        <DashboardAnnouncements
          canCreate={canCreateAnnouncement}
          fallbackData={announcementsFallbackUser}
          nowMs={nowMs}
        />
      </section>

      <DashboardTodayBrief />

      {showCsToolsCard && <CsClientsEntryCard canManage={manageClients} />}

      {/* 디자인 2단계: 대시보드에서 숨김 (페이지·API 유지) — CS 링크 허브 */}
      {false && showCsToolsCard && (
        <Link
          href="/cs-tools"
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
        >
          <div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Link2 className="size-5" />
              <span className="text-sm font-medium text-foreground">CS 링크 허브</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">상담·번역·문서 등 외부 도구 바로가기</p>
          </div>
          <span className="text-primary shrink-0 text-sm font-medium">열기 →</span>
        </Link>
      )}

      <Link
        href="/tasks"
        className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <ListTodo className="size-5" />
          <span className="text-sm">프로젝트</span>
        </div>
        <p className="mt-2 text-2xl font-semibold">{myTasks.length}건</p>
        <p className="text-muted-foreground text-sm">미완료 할 일</p>
        <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
          프로젝트 목록 →
        </span>
      </Link>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/leave"
          className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="size-5" />
            <span className="text-sm">남은 연차</span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{remaining}일</p>
          <p className="text-muted-foreground text-sm">
            사용 {used + manual} / 전체 휴가 {totalLeave}일
          </p>
          <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
            연차/근태 →
          </span>
        </Link>
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="size-5" />
            <span className="text-sm">목표</span>
          </div>
          <p className="mt-2 font-semibold">이번 달 목표</p>
          <p className="text-muted-foreground text-sm">
            미완료 프로젝트 {myTasks.length}건 완료하기
          </p>
        </div>
      </div>

      {/* 디자인 2단계: 대시보드에서 숨김 — 지시사항 목록은 브리핑 할일로 대체 */}
      {false && (
      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <ListTodo className="size-5" />
          새로운 지시사항 / 오늘의 할 일 (D-Day 임박 순)
        </h2>
        {myTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 py-8 text-center text-muted-foreground">
            할당된 미완료 프로젝트가 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {myTasks.map((task: any) => {
              const due = task.dueDate ? new Date(task.dueDate) : null;
              const urgent = due ? isDueSoonOrOverdue(due) : false;
              return (
                <li key={task.id}>
                  <Link
                    href="/tasks"
                    className="flex items-center gap-2 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex-1 font-medium">{task.title}</span>
                    {urgent && <Badge variant="destructive">마감 임박</Badge>}
                    <span className="text-muted-foreground text-sm">
                      {due ? format(due, "MM/dd (EEE)", { locale: ko }) : "마감 미정"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/tasks" className="text-primary mt-2 inline-block text-sm font-medium hover:underline">
          전체 프로젝트 보기 →
        </Link>
      </section>
      )}

      {/* 디자인 2단계: 대시보드에서 숨김 — 일정 / 프로젝트 리마인드 바로가기 */}
      {false && (
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/schedule"
          className="flex items-center gap-4 rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
        >
          <Calendar className="size-10 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">일정</h2>
            <p className="text-muted-foreground text-sm">내 일정을 확인하고 관리하세요.</p>
          </div>
        </Link>
        <Link
          href="/tasks"
          className="flex items-center gap-4 rounded-lg border bg-card p-6 transition-colors hover:bg-muted/50"
        >
          <ListTodo className="size-10 text-muted-foreground" />
          <div>
            <h2 className="font-semibold">프로젝트 리마인드</h2>
            <p className="text-muted-foreground text-sm">
              할당된 프로젝트를 확인하고 완료 처리하세요.
            </p>
          </div>
        </Link>
      </div>
      )}

    </div>
  );
}

function CsClientsEntryCard({ canManage }: { canManage: boolean }) {
  return (
    <Link
      href="/cs-clients"
      className="chip-accent-border chip-accent-border--blue flex flex-col gap-1 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
    >
      <span className="flex items-center gap-2 text-base font-semibold">
        <Building2 className="size-5 text-muted-foreground" />
        {csClientNavLabel(canManage)}
      </span>
      <span className="text-muted-foreground text-sm">{csClientNavDescription(canManage)}</span>
    </Link>
  );
}

