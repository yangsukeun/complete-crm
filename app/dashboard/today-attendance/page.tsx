import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { parse, isValid } from "date-fns";
import { ArrowLeft, ClipboardList } from "lucide-react";
import prisma from "@/lib/prisma";
import { authWithTimeout } from "@/lib/auth-safe";
import { resolveAppModeForUser } from "@/lib/app-mode-server";
import { startOfDayKst, formatKstHm, todayYmdKst } from "@/lib/date-kst";
import { formatUserName } from "@/lib/utils";
import { PageHeadline } from "@/components/page-headline";
import { Button } from "@/components/ui/button";

function resolveDateStart(dateParam: string | undefined): Date {
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return startOfDayKst(new Date());
  }
  const d = parse(dateParam, "yyyy-MM-dd", new Date());
  return isValid(d) ? startOfDayKst(d) : startOfDayKst(new Date());
}

function dateLabelKst(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

type SearchParams = Promise<{ date?: string }>;

export default async function TodayAttendancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await authWithTimeout();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const appMode = await resolveAppModeForUser(session.user.id, cookieStore);
  if (appMode !== "company") {
    redirect("/dashboard");
  }

  const role = session.user.role ?? "USER";
  const isAdmin = role === "EXECUTIVE" || role === "ADMIN";
  if (!isAdmin) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const dateStart = resolveDateStart(sp.date);
  const todayStart = startOfDayKst(new Date());
  const isToday = dateStart.getTime() === todayStart.getTime();
  const dateYmd = dateStart.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const [employeeCount, todayAttendances, attendedIdRows] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.attendance.findMany({
      where: { date: dateStart },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            department: true,
            position: true,
          },
        },
      },
      orderBy: [{ checkIn: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.attendance.findMany({
      where: { date: dateStart },
      select: { userId: true },
    }),
  ]);

  const attendedIds = attendedIdRows.map((r) => r.userId);
  const absentStaff = await prisma.user.findMany({
    where: {
      role: "USER",
      ...(attendedIds.length > 0 ? { id: { notIn: attendedIds } } : {}),
    },
    select: { id: true, name: true, email: true, department: true, position: true },
    orderBy: { name: "asc" },
  });

  const attendedCount = todayAttendances.length;
  const todayYmd = todayYmdKst();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadline
          title="금일 출근 목록"
          description={`${dateLabelKst(dateStart)} 기준 출퇴근 기록입니다. 직원 ${employeeCount}명 중 출근 처리 ${attendedCount}명.`}
        />
        <Button variant="outline" size="sm" asChild className="shrink-0 gap-1 self-start sm:self-center">
          <Link href="/dashboard" prefetch={false}>
            <ArrowLeft className="size-4" />
            대시보드
          </Link>
        </Button>
      </div>

      {!isToday && (
        <p className="text-muted-foreground text-sm">
          <Link href="/dashboard/today-attendance" className="text-primary font-medium hover:underline">
            오늘({todayYmd}) 목록으로
          </Link>
        </p>
      )}

      <p className="text-muted-foreground text-xs">
        조회일 <span className="font-mono text-foreground">{dateYmd}</span>
        {!isToday && (
          <>
            {" · "}
            <Link href={`/dashboard/today-attendance?date=${todayYmd}`} className="text-primary hover:underline">
              오늘로 이동
            </Link>
          </>
        )}
        {" · "}
        URL <code className="rounded bg-muted px-1">?date=YYYY-MM-DD</code> 로 날짜 지정 가능
      </p>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <ClipboardList className="size-5 text-muted-foreground" />
          <h2 className="font-semibold">출근 기록이 있는 직원 ({attendedCount}명)</h2>
        </div>
        {todayAttendances.length === 0 ? (
          <p className="text-muted-foreground px-4 py-10 text-center text-sm">
            아직 출근 처리된 직원이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">이름</th>
                  <th className="px-4 py-2.5 font-medium">부서</th>
                  <th className="px-4 py-2.5 font-medium">직책</th>
                  <th className="px-4 py-2.5 font-medium">출근</th>
                  <th className="px-4 py-2.5 font-medium">퇴근</th>
                </tr>
              </thead>
              <tbody>
                {todayAttendances.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{formatUserName(a.user)}</td>
                    <td className="text-muted-foreground px-4 py-2.5">{a.user.department ?? "—"}</td>
                    <td className="text-muted-foreground px-4 py-2.5">{a.user.position ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {a.checkIn ? formatKstHm(a.checkIn) : "—"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {a.checkOut ? formatKstHm(a.checkOut) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">
            오늘 아직 출근 기록이 없는 직원 ({absentStaff.length}명)
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            역할이 &quot;USER&quot;인 직원만 집계합니다. (대시보드 &quot;전체 직원&quot; 인원과 동일 기준)
          </p>
        </div>
        {absentStaff.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            모두 출근 처리되었거나 해당 인원이 없습니다.
          </p>
        ) : (
          <ul className="divide-y px-4 py-2">
            {absentStaff.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm"
              >
                <span className="font-medium">{formatUserName(u)}</span>
                <span className="text-muted-foreground">{u.department ?? "—"}</span>
                <span className="text-muted-foreground">{u.position ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href="/hr" prefetch={false}>
            인사(출퇴근) 페이지
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin/employees" prefetch={false}>
            직원 관리
          </Link>
        </Button>
      </div>
    </div>
  );
}
