import { NextResponse } from "next/server";
import { getAppSession } from "@/auth";
import prisma from "@/lib/prisma";
import { canViewCsOrg } from "@/lib/cs-client-access";
import { clipPeriodToMonth, kstMonthRange, parseYearMonth } from "@/lib/cs-org-month";
import { todayYmdKst } from "@/lib/date-kst";
import { csOrgPeopleWhere } from "@/lib/cs-org-data";

async function loadMe(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, department: true },
  });
}

export async function GET(req: Request) {
  try {
    const session = await getAppSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = await loadMe(session.user.id);
    if (!me || !canViewCsOrg(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ym = parseYearMonth(new URL(req.url).searchParams.get("ym"));
    const today = todayYmdKst();
    const { start, end } = kstMonthRange(ym);

    const [people, periods] = await Promise.all([
      prisma.user.findMany({
        where: csOrgPeopleWhere,
        select: { id: true, name: true, position: true },
        orderBy: { name: "asc" },
      }),
      prisma.csClientAssignmentPeriod.findMany({
        where: {
          startedOn: { lte: end },
          OR: [{ endedOn: null }, { endedOn: { gte: start } }],
          client: { deletedAt: null },
        },
        select: {
          id: true,
          userId: true,
          startedOn: true,
          endedOn: true,
          roleLabel: true,
          client: { select: { id: true, name: true } },
        },
      }),
    ]);

    const byUser = new Map<string, typeof periods>();
    for (const p of periods) {
      const span = clipPeriodToMonth({
        startedOn: p.startedOn,
        endedOn: p.endedOn,
        ym,
        today,
      });
      if (!span) continue;
      const list = byUser.get(p.userId) ?? [];
      list.push(p);
      byUser.set(p.userId, list);
    }

    const rows = people.map((person) => {
      const brands = (byUser.get(person.id) ?? [])
        .map((p) => {
          const span = clipPeriodToMonth({
            startedOn: p.startedOn,
            endedOn: p.endedOn,
            ym,
            today,
          });
          if (!span) return null;
          return {
            clientId: p.client.id,
            name: p.client.name,
            roleLabel: p.roleLabel,
            from: span.from,
            until: span.until,
            days: span.days,
            ongoing: span.ongoing,
          };
        })
        .filter((b): b is NonNullable<typeof b> => Boolean(b))
        .sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name, "ko"));
      return {
        userId: person.id,
        name: person.name,
        position: person.position,
        brands,
      };
    });

    return NextResponse.json({ ym, people: rows });
  } catch {
    console.error("[cs-org] month get failed");
    return NextResponse.json({ error: "월별 담당을 불러올 수 없습니다." }, { status: 500 });
  }
}
