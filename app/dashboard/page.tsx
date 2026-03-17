import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { Calendar, ListTodo, Users, ClipboardList, Target, CalendarClock } from "lucide-react";
import { format, addDays } from "date-fns";
import { startOfDayKst } from "@/lib/date-kst";
import { ko } from "date-fns/locale";
import prisma from "@/lib/prisma";
import { authWithTimeout } from "@/lib/auth-safe";
import { formatUserName } from "@/lib/utils";
import { getAnnualLeaveEntitlement } from "@/lib/leave";
import { getDashboardSalesStats } from "@/lib/dashboard-sales";
import { DashboardAttendance } from "@/components/dashboard-attendance";
import { DashboardAnnouncements } from "@/components/dashboard-announcements";
import { DashboardSalesSection } from "@/components/dashboard-sales-section";
import { PageHeadline } from "@/components/page-headline";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await authWithTimeout();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = cookieStore.get("app_mode")?.value;
  if (appMode !== "company" && appMode !== "personal") {
    redirect("/choose-mode");
  }
  const isCompanyMode = appMode === "company";

  const role = session.user.role ?? "USER";
  const isAdmin = role === "EXECUTIVE" || role === "ADMIN";
  const canCreateAnnouncement =
    role === "TEAM_LEAD" || role === "EXECUTIVE" || role === "ADMIN";
  const todayStart = startOfDayKst(new Date());

  // 개인 모드: 연차/출퇴근 없이 일정·업무·목표만
  if (!isCompanyMode) {
    const now = new Date();
    const weekEnd = addDays(now, 7);
    const [myTasks, upcomingSchedules] = await Promise.all([
      prisma.task.findMany({
        where: { assignedToId: session.user.id, isCompleted: false },
        orderBy: { dueDate: "asc" },
        take: 10,
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
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeadline
          title={`안녕하세요, ${session.user.name ?? session.user.email}님`}
          description="개인 모드 — 내 일정·할 일만 간단히 관리합니다."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/schedule"
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
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
          <Link
            href="/tasks"
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <ListTodo className="size-5" />
              <span className="text-sm">업무</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{myTasks.length}건</p>
            <p className="text-muted-foreground text-sm">미완료 할 일</p>
            <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
              업무 목록 →
            </span>
          </Link>
          <div className="rounded-lg border bg-card p-4 opacity-90">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="size-5" />
              <span className="text-sm">남은 연차</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">—</p>
            <p className="text-muted-foreground text-sm">회사 모드에서 확인</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="size-5" />
              <span className="text-sm">목표</span>
            </div>
            <p className="mt-2 font-semibold">이번 달 목표</p>
            <p className="text-muted-foreground text-sm">
              미완료 업무 {myTasks.length}건 완료하기
            </p>
          </div>
        </div>
        {upcomingSchedules.length > 0 && (
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
      </div>
    );
  }

  if (isAdmin) {
    const year = new Date().getFullYear();
    const weekEnd = addDays(todayStart, 7);
    const adminUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { joinDate: true },
    });
    const joinDate = adminUser?.joinDate ?? new Date();
    const annualTotal = getAnnualLeaveEntitlement(joinDate, year);

    const [
      employeeCount,
      todayAttendances,
      tasksCreatedByMe,
      adminTodayAttendance,
      adminUpcomingSchedules,
      adminLeaveBalance,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "USER" } }),
      prisma.attendance.findMany({
        where: { date: todayStart },
        include: { user: { select: { name: true, department: true, position: true } } },
      }),
      prisma.task.findMany({
        where: { createdById: session.user.id },
        include: { assignedTo: { select: { name: true, position: true } } },
        orderBy: { dueDate: "asc" },
        take: 100,
      }),
      prisma.attendance.findUnique({
        where: { userId_date: { userId: session.user.id, date: todayStart } },
      }),
      prisma.schedule.findMany({
        where: {
          userId: session.user.id,
          startTime: { gte: new Date(), lte: weekEnd },
        },
        orderBy: { startTime: "asc" },
        take: 5,
      }),
      prisma.leaveBalance.findUnique({
        where: { userId_year: { userId: session.user.id, year } },
      }),
    ]);

    const completedTasks = tasksCreatedByMe.filter((t: any) => t.isCompleted);
    const progressPercent =
      tasksCreatedByMe.length > 0
        ? Math.round((completedTasks.length / tasksCreatedByMe.length) * 100)
        : 0;
    const used = adminLeaveBalance?.annualUsed ?? 0;
    const manual = adminLeaveBalance?.manualDeduction ?? 0;
    const remaining = Math.max(0, annualTotal - used - manual);
    const incompleteCount = tasksCreatedByMe.filter((t: any) => !t.isCompleted).length;
    const salesStats = await getDashboardSalesStats();

    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <PageHeadline
            title={`안녕하세요, ${session.user.name ?? session.user.email}님`}
            description="관리자 대시보드 — 공지·업무·직원 현황을 한눈에 볼 수 있습니다."
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
          <DashboardAnnouncements canCreate={true} />
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/schedule"
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="size-5" />
              <span className="text-sm">일정</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{adminUpcomingSchedules.length}건</p>
            <p className="text-muted-foreground text-sm">다음 7일 일정</p>
            <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
              일정표 →
            </span>
          </Link>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ListTodo className="size-5" />
              <span className="text-sm">업무</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{progressPercent}%</p>
            <p className="text-muted-foreground text-sm">
              완료 {completedTasks.length} / 전체 {tasksCreatedByMe.length}건
            </p>
            <Link href="/tasks" className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
              업무 목록 →
            </Link>
          </div>
          <Link
            href="/leave"
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="size-5" />
              <span className="text-sm">남은 연차</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{remaining}일</p>
            <p className="text-muted-foreground text-sm">
              사용 {used + manual} / 부여 {annualTotal}일
            </p>
            <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
              연차/근태 →
            </span>
          </Link>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Target className="size-5" />
              <span className="text-sm">목표</span>
            </div>
            <p className="mt-2 font-semibold">이번 달 목표</p>
            <p className="text-muted-foreground text-sm">
              미완료 업무 {incompleteCount}건 완료하기
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-5" />
              <span className="text-sm">전체 직원</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{employeeCount}명</p>
            <Link href="/admin/employees" className="text-primary mt-1 text-sm font-medium hover:underline">
              직원 관리 →
            </Link>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ClipboardList className="size-5" />
              <span className="text-sm">금일 출근</span>
            </div>
            <p className="mt-2 text-2xl font-semibold">{todayAttendances.length}명</p>
            <ul className="text-muted-foreground mt-2 text-xs">
              {todayAttendances.slice(0, 3).map((a: any) => (
                <li key={a.id}>
                  {formatUserName(a.user)}
                  {a.checkIn ? ` ${formatKstTime(a.checkIn)} 출근` : ""}
                </li>
              ))}
              {todayAttendances.length > 3 && <li>외 {todayAttendances.length - 3}명</li>}
            </ul>
          </div>
        </div>

        {adminUpcomingSchedules.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <Calendar className="size-5" />
              다가오는 일정
            </h2>
            <ul className="space-y-2">
              {adminUpcomingSchedules.map((s: any) => (
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
              <h2 className="font-semibold">업무 리마인드</h2>
              <p className="text-muted-foreground text-sm">
                직원에게 업무를 지시하고 진행 상황을 확인하세요.
              </p>
            </div>
          </Link>
        </div>

        <DashboardSalesSection data={salesStats} />
      </div>
    );
  }

  // 회사 모드 · User: 일정·업무·남은 연차·목표 + 출퇴근
  const year = new Date().getFullYear();
  const weekEnd = addDays(new Date(), 7);
  const userForLeave = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { joinDate: true },
  });
  const joinDate = userForLeave?.joinDate ?? new Date();
  const annualTotal = getAnnualLeaveEntitlement(joinDate, year);

  const [myTasks, myTodayAttendance, upcomingSchedules, leaveBalance, salesStats] = await Promise.all([
    prisma.task.findMany({
      where: { assignedToId: session.user.id, isCompleted: false },
      orderBy: { dueDate: "asc" },
      take: 10,
      include: { createdBy: { select: { name: true, position: true } } },
    }),
    prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: todayStart } },
    }),
    prisma.schedule.findMany({
      where: {
        userId: session.user.id,
        startTime: { gte: new Date(), lte: weekEnd },
      },
      orderBy: { startTime: "asc" },
      take: 5,
    }),
    prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: session.user.id, year } },
    }),
    getDashboardSalesStats(),
  ]);

  const used = leaveBalance?.annualUsed ?? 0;
  const manual = leaveBalance?.manualDeduction ?? 0;
  const remaining = Math.max(0, annualTotal - used - manual);

  const isDueSoonOrOverdue = (due: Date) => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return due <= endOfToday;
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
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
        <DashboardAnnouncements canCreate={canCreateAnnouncement} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/schedule"
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
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
        <Link
          href="/tasks"
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <ListTodo className="size-5" />
            <span className="text-sm">업무</span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{myTasks.length}건</p>
          <p className="text-muted-foreground text-sm">미완료 할 일</p>
          <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
            업무 목록 →
          </span>
        </Link>
        <Link
          href="/leave"
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="size-5" />
            <span className="text-sm">남은 연차</span>
          </div>
          <p className="mt-2 text-2xl font-semibold">{remaining}일</p>
          <p className="text-muted-foreground text-sm">
            사용 {used + manual} / 부여 {annualTotal}일
          </p>
          <span className="text-primary mt-1 inline-block text-sm font-medium hover:underline">
            연차/근태 →
          </span>
        </Link>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="size-5" />
            <span className="text-sm">목표</span>
          </div>
          <p className="mt-2 font-semibold">이번 달 목표</p>
          <p className="text-muted-foreground text-sm">
            미완료 업무 {myTasks.length}건 완료하기
          </p>
        </div>
      </div>

      {upcomingSchedules.length > 0 && (
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

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <ListTodo className="size-5" />
          새로운 지시사항 / 오늘의 할 일 (D-Day 임박 순)
        </h2>
        {myTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 py-8 text-center text-muted-foreground">
            할당된 미완료 업무가 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {myTasks.map((task: any) => {
              const due = new Date(task.dueDate);
              const urgent = isDueSoonOrOverdue(due);
              return (
                <li key={task.id}>
                  <Link
                    href="/tasks"
                    className="flex items-center gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex-1 font-medium">{task.title}</span>
                    {urgent && <Badge variant="destructive">마감 임박</Badge>}
                    <span className="text-muted-foreground text-sm">
                      {format(due, "MM/dd (EEE)", { locale: ko })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/tasks" className="text-primary mt-2 inline-block text-sm font-medium hover:underline">
          전체 업무 보기 →
        </Link>
      </section>

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
            <h2 className="font-semibold">업무 리마인드</h2>
            <p className="text-muted-foreground text-sm">
              할당된 업무를 확인하고 완료 처리하세요.
            </p>
          </div>
        </Link>
      </div>

      <DashboardSalesSection data={salesStats} />
    </div>
  );
}

function formatKstTime(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  // 서버(Vercel)는 기본 UTC일 수 있어 타임존을 명시
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
