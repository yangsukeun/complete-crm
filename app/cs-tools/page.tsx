import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { CsToolsPageClient } from "./cs-tools-page-client";
import { DashboardAttendance } from "@/components/dashboard-attendance";
import prisma from "@/lib/prisma";
import { startOfDayKst } from "@/lib/date-kst";
import { canViewAwayOverview } from "@/lib/attendance-away-access";
import Link from "next/link";

export default async function CsToolsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const todayStart = startOfDayKst(new Date());
  const [attendance, me] = await Promise.all([
    prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: todayStart } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, department: true },
    }),
  ]);

  const showOverview = canViewAwayOverview({
    role: me?.role ?? session.user.role,
    department: me?.department ?? session.user.department,
  });

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeadline
          title="CS 링크 허브"
          description="CS 업무에 쓰는 외부 도구·링크를 한곳에서 엽니다."
        />
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <DashboardAttendance
            initial={
              attendance
                ? {
                    id: attendance.id,
                    checkIn: attendance.checkIn?.toISOString() ?? null,
                    checkOut: attendance.checkOut?.toISOString() ?? null,
                    date: attendance.date.toISOString(),
                  }
                : null
            }
          />
          {showOverview && (
            <Link href="/cs-tools/away" className="text-primary text-sm font-medium hover:underline">
              이석 현황 →
            </Link>
          )}
        </div>
      </div>
      <CsToolsPageClient />
    </div>
  );
}
