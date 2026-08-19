import { redirect } from "next/navigation";
import { getAppSession } from "@/auth";
import { PageHeadline } from "@/components/page-headline";
import { CsToolsPageClient } from "./cs-tools-page-client";
import { DashboardAttendance } from "@/components/dashboard-attendance";
import { CsScreen } from "@/components/cs-screen";
import { ColorChip } from "@/components/ui/color-chip";
import Link from "next/link";
import { Building2, CalendarPlus, Cake, Megaphone, Users } from "lucide-react";
import prisma from "@/lib/prisma";
import { startOfDayKst } from "@/lib/date-kst";
import { canUseAwayFeature, canViewAwayOverview, summarizeAwayLogs } from "@/lib/attendance-away-access";
import { canAccessCsLounge } from "@/lib/cs-lounge-access";
import { canManageCsClients, csClientNavDescription, csClientNavLabel } from "@/lib/cs-client-access";
import { isExecutiveOrAdmin } from "@/lib/role-access";
import { pickCsBirthdaysThisMonth } from "@/lib/cs-org";

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
  const loungeOk = canAccessCsLounge({
    role: me?.role ?? session.user.role,
    department: me?.department ?? session.user.department,
  });
  const manageClients = canManageCsClients({
    role: me?.role ?? session.user.role,
    department: me?.department ?? session.user.department,
  });

  const [notices, csUsers] = loungeOk
    ? await Promise.all([
        prisma.csLoungePost.findMany({
          where: { deletedAt: null, type: "NOTICE" },
          orderBy: { createdAt: "desc" },
          take: 2,
          select: { id: true, content: true, createdAt: true, author: { select: { name: true } } },
        }),
        prisma.user.findMany({
          where: { department: { in: ["CS", "CS팀"] } },
          select: { id: true, name: true, birthDate: true },
        }),
      ])
    : [[], [] as { id: string; name: string; birthDate: Date | null }[]];

  const { birthdays, missingCount } = pickCsBirthdaysThisMonth(csUsers);
  const showMissing = isExecutiveOrAdmin(me?.role ?? session.user.role);

  return (
    <CsScreen>
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
      {loungeOk && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/leave"
            className="flex flex-col gap-1 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <CalendarPlus className="size-4 text-muted-foreground" />
              휴가 신청
            </span>
            <span className="text-muted-foreground text-sm">연차/근태 화면에서 신청합니다.</span>
          </Link>
          <Link
            href="/cs-clients"
            className="chip-accent-border chip-accent-border--blue flex flex-col gap-1 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <Building2 className="size-4 text-muted-foreground" />
              {csClientNavLabel(manageClients)}
            </span>
            <span className="text-muted-foreground text-sm">{csClientNavDescription(manageClients)}</span>
          </Link>
          {manageClients ? (
          <Link
            href="/cs-org"
            className="flex flex-col gap-1 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <Users className="size-4 text-muted-foreground" />
              조직도
            </span>
            <span className="text-muted-foreground text-sm">센터장 아래 팀장·부팀장 피라미드와 담당 업체를 봅니다. 팀장 이상만 볼 수 있습니다.</span>
          </Link>
          ) : null}
          <Link
            href="/cs-lounge"
            className="flex flex-col gap-2 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50 sm:col-span-2"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <Megaphone className="size-4 text-muted-foreground" />
              CS 라운지
            </span>
            {notices.length === 0 ? (
              <span className="text-muted-foreground text-sm">최근 공지가 없습니다. 라운지에서 확인하세요.</span>
            ) : (
              <ul className="space-y-1 text-sm">
                {notices.map((n) => (
                  <li key={n.id} className="line-clamp-1 text-muted-foreground">
                    <span className="text-foreground font-medium">{n.author.name}</span>
                    {" · "}
                    <span dangerouslySetInnerHTML={{ __html: n.content }} />
                  </li>
                ))}
              </ul>
            )}
          </Link>
          <div className="chip-accent-border chip-accent-border--pink rounded-xl border bg-card p-5 sm:col-span-2">
            <p className="cs-section-title mb-3 flex items-center gap-2">
              <ColorChip tone="pink" icon={<Cake />}>
                이번 달 생일
              </ColorChip>
            </p>
            {birthdays.length === 0 ? (
              <p className="text-muted-foreground text-sm">이번 달 생일인 CS 직원이 없습니다.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {birthdays.map((b) => (
                  <li key={b.id}>
                    <ColorChip tone="pink" emphasis={b.isToday} icon={b.isToday ? "🎂" : undefined}>
                      {b.name} {b.monthDay}
                    </ColorChip>
                  </li>
                ))}
              </ul>
            )}
            {showMissing && missingCount > 0 && (
              <p className="text-muted-foreground mt-3 text-xs">생년월일 미입력 {missingCount}명</p>
            )}
          </div>
        </div>
      )}
      {!loungeOk && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/leave"
            className="flex flex-col gap-1 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 text-base font-semibold">
              <CalendarPlus className="size-4 text-muted-foreground" />
              휴가 신청
            </span>
            <span className="text-muted-foreground text-sm">연차/근태 화면에서 신청합니다.</span>
          </Link>
        </div>
      )}
      <CsToolsPageClient />
    </CsScreen>
  );
}
