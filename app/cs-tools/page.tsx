import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { CsToolsPageClient } from "./cs-tools-page-client";
import { DashboardAttendance } from "@/components/dashboard-attendance";
import prisma from "@/lib/prisma";
import { startOfDayKst } from "@/lib/date-kst";
import { canUseAwayFeature, canViewAwayOverview, summarizeAwayLogs } from "@/lib/attendance-away-access";

export default async function CsToolsPage() {
  const session = await getAppSession();
  if (!session?.user?.id) redirect("/login");

  const todayStart = startOfDayKst(new Date());
  const [attendance, me, awayLogs] = await Promise.all([
    prisma.attendance.findUnique({
      where: { userId_date: { userId: session.user.id, date: todayStart } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, department: true },
    }),
    prisma.awayLog.findMany({
      where: { userId: session.user.id, startedAt: { gte: todayStart } },
      select: { id: true, type: true, startedAt: true, endedAt: true },
    }),
  ]);

  const showOverview = canViewAwayOverview({
    role: me?.role ?? session.user.role,
    department: me?.department ?? session.user.department,
  });

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeadline
        title="CS 링크 허브"
        description="CS 업무에 쓰는 외부 도구·링크를 한곳에서 엽니다."
      />
      <DashboardAttendance
        emphasized
        showManagerLinks={showOverview}
        showAway={canUseAwayFeature({
          department: me?.department ?? session.user.department,
        })}
        initialAway={summarizeAwayLogs(awayLogs)}
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
      <CsToolsPageClient />
    </div>
  );
}
